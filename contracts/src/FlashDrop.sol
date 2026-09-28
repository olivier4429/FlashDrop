// SPDX-License-Identifier: MIT
// Pinned (not ^0.8.24) so the deployed bytecode always comes from the exact compiler version the
// test suite ran against : see hardhat.config.ts, which pins the same version and evmVersion.
pragma solidity 0.8.24;

import {ISignatureTransfer} from "./interfaces/IPermit2.sol";

/// @title FlashDrop
/// @notice Single-product reverse Dutch auction: the price steps down from `startPrice` to
/// `endPrice` over `duration` seconds, in equal drops every `stepDuration` seconds (a staircase
/// under the straight line from start to end), and the first `buy()` that lands wins the item at
/// whatever price was current at that instant. One sale is active at a time : once it's
/// sold (or cancelled via `cancelSale`), the seller can call `startNewSale` to reuse this same
/// contract for the next item instead of redeploying (still no concurrent multi-item catalog :
/// see PROJECT_BRIEF.md). Demo mode: once the current round has sold or reached its floor price,
/// anyone can put the same item back on sale from its start price via `relaunchSale`.
contract FlashDrop {
    // USDC on Arc is both the ERC-20 interface (6 decimals, used here) and the native gas asset
    // (18 decimals, same underlying balance) : the two must never be mixed in a calculation. This
    // fixed address is the ERC-20 interface, confirmed via docs.arc.io / explorer.arc.io Blockscout
    // on 2026-09-17 (see docs/arc-notes/03-adresses-contrats.md); identical on mainnet and testnet.
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    // Permit2 is already deployed on Arc (same address on mainnet/testnet, see docs/arc-notes/03).
    // We use it instead of having each buyer approve() this contract directly. With a plain
    // approve(), every new FlashDrop instance would need its own on-chain approval before a first
    // purchase : an extra transaction, and extra seconds, at exactly the moment the buyer has
    // decided the price is right and is racing anyone else watching the same drop. With Permit2,
    // the buyer approves Permit2 once (ever, across every contract that uses it), and each
    // purchase after that is authorized by an off-chain EIP-712 signature (no gas, not a
    // transaction) for "up to X USDC", bound to this contract, a single-use nonce and a deadline.
    // buy() below then pulls only the current (possibly lower) price in one on-chain transaction,
    // and no standing allowance to this contract is ever left behind.
    ISignatureTransfer public constant PERMIT2 = ISignatureTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    // Fixed for the lifetime of this contract instance: every sale ever run through it, across
    // every reset via startNewSale, always pays out to this same address. Immutable, so it lives
    // in the bytecode and costs no storage slot.
    address public immutable seller;

    // ---- Storage layout ----
    // Packed into 3 slots (plus the 2 strings) instead of one 32-byte slot per field, so buy() :
    // the one call that races other buyers : touches only 3 cold slots and only ever rewrites
    // slots that are already non-zero (5 000 gas per cold slot : 2 100 access + 2 900 write :
    // instead of 22 100 for a zero -> non-zero write). Field order matters: Solidity packs
    // consecutive fields into the same slot only while they fit, so everything buy() reads or
    // writes is grouped here on purpose.
    //
    // The narrow types are safe bounds, not just a gas trick: they are also the constructor /
    // startNewSale parameter types, so ABI decoding itself rejects any out-of-range input, and
    // currentPrice()'s arithmetic (done in uint256, see below) can never overflow.

    // Slot 0 (31/32 bytes): who bought, when the sale started, how long it lasts, and its state.
    address public buyer;
    // Seconds since epoch. uint40 is good until the year 36812. This is the block.timestamp at
    // which the sale started : see currentPrice() for why reading time this way is fine on Arc.
    uint40 public startTime;
    uint32 public duration; // seconds, up to ~136 years
    bool public sold;
    // Set by the seller via cancelSale() to pull an active (not-yet-sold) sale without a purchase
    // ever happening : distinct from `sold` so a cancelled sale never shows up as a completed sale
    // (e.g. in the frontend's past-sales history, which is built from Sold events only) and so
    // buy() can tell "someone already bought this" apart from "the seller pulled this item" when
    // deciding what to revert with.
    bool public cancelled;

    // Slot 1 (32/32 bytes): prices and the sale counter.
    // USDC amounts in the 6-decimal ERC-20 interface. uint64 caps a price at ~18.4 trillion USDC,
    // far above USDC's entire circulating supply, so no real price is excluded.
    uint64 public startPrice;
    uint64 public endPrice;
    uint64 public soldPrice;
    // Incremented by every _startSale (so the first sale is 1, never 0). buy() requires the
    // caller to name the sale it means to buy : see buy() for why that matters on a reusable
    // contract.
    uint64 public saleId;

    // Slot 2 (4/32 bytes): how long each price level lasts, in seconds. Its own slot because slots
    // 0 and 1 are already full; buy() reads it (via currentPrice) but never writes it. A value of 1
    // gives the old per-second, effectively continuous decay.
    uint32 public stepDuration;

    // Slots 3+: what's actually being sold. Stored on-chain (rather than only in frontend config)
    // so that the item description always travels together with the price it's attached to:
    // since the same contract instance is reused sequentially across items via startNewSale, a
    // frontend-only title would otherwise risk showing the *previous* item's name next to the
    // *new* item's price if the seller forgot to update it separately.
    string public itemName;
    string public itemDescription;

    // Every event carries the (indexed) saleId it belongs to, so an off-chain history can pair a
    // Sold/SaleCancelled log with the SaleStarted log of the same item directly : by id, with an
    // eth_getLogs topic filter if needed : rather than inferring it from log order. Amounts and
    // times stay uint256 in events: logs cost no storage, so there's nothing to gain by narrowing.
    event Sold(uint64 indexed saleId, address indexed buyer, uint256 price, uint256 timestamp);
    event SaleStarted(
        uint64 indexed saleId,
        string itemName,
        string itemDescription,
        uint256 startPrice,
        uint256 endPrice,
        uint256 startTime,
        uint256 duration,
        uint256 stepDuration
    );
    event SaleCancelled(uint64 indexed saleId, uint256 timestamp);

    // Custom errors instead of require(..., "string"): each revert reason is a 4-byte selector
    // (plus its arguments) rather than an ABI-encoded string stored in the bytecode, which makes
    // the contract smaller and every failed call cheaper. Frontends decode them by name from the
    // ABI (see frontend/src/chain/abi/flashDrop.ts).
    error NotSeller();
    error SaleStillActive();
    error AlreadySold();
    error AlreadyCancelled();
    error SaleIsCancelled();
    error SaleChanged(uint64 expectedSaleId, uint64 currentSaleId);
    error PermitTokenNotUSDC(address token);
    error SignedAmountBelowPrice(uint256 signedAmount, uint256 currentPrice);
    error InvalidPriceRange();
    error ZeroDuration();
    error InvalidStepDuration();

    constructor(
        string memory _itemName,
        string memory _itemDescription,
        uint64 _startPrice,
        uint64 _endPrice,
        uint32 _duration,
        uint32 _stepDuration
    ) {
        seller = msg.sender;
        _startSale(_itemName, _itemDescription, _startPrice, _endPrice, _duration, _stepDuration);
    }

    /// @notice Reuses this contract for a new item once the current one has sold or been
    /// cancelled, instead of deploying a fresh instance per item. Only the original seller may
    /// call this, and only once the current sale is no longer active : an active, not-yet-sold,
    /// not-yet-cancelled sale can't be replaced directly (see cancelSale below). Unlike
    /// relaunchSale, a sale left unsold at its floor price still counts as active here: it stays
    /// buyable until the seller cancels it.
    function startNewSale(
        string memory _itemName,
        string memory _itemDescription,
        uint64 _startPrice,
        uint64 _endPrice,
        uint32 _duration,
        uint32 _stepDuration
    ) external {
        if (msg.sender != seller) revert NotSeller();
        if (!sold && !cancelled) revert SaleStillActive();
        _clearOutcome();
        _startSale(_itemName, _itemDescription, _startPrice, _endPrice, _duration, _stepDuration);
    }

    /// @notice DEMO MODE: lets ANYONE put the current item back on sale as a new round (new
    /// saleId, price back to startPrice) once the current round is over : either sold, or left
    /// unsold until its price reached the floor. It replays exactly what the seller last set
    /// (item, prices, duration, step), so testers of the public mainnet demo can run the drop
    /// again without the seller being online. The frontend shows each round as its own numbered
    /// item ("<itemName> #<saleId>"), so a relaunch after a purchase reads as the next listing,
    /// not as the same item being sold twice.
    /// Why these limits:
    ///  - A live round can't be restarted: otherwise anyone could push the price back up at will
    ///    (for ~0.001 USDC of gas per call) and a price that's meant to fall never would.
    ///  - A cancelled round can't be restarted: cancelSale() is the seller's way to take the item
    ///    off the market, and nobody else may undo that. Only startNewSale can follow it.
    /// The caller controls nothing: no arguments, proceeds always go to the immutable `seller`,
    /// and a buy() signed for the previous round reverts with SaleChanged instead of landing on
    /// the new one (see buy()).
    function relaunchSale() external {
        if (cancelled) revert SaleIsCancelled();
        uint256 end = uint256(startTime) + duration;
        // Same elapsed-wall-time test currentPrice() uses to decide the floor has been reached:
        // fine on Arc, whose block.timestamp never goes backwards. It orders nothing : if a buy()
        // and a relaunchSale() race for the same floor-price round, whichever is included first
        // wins, and a buy() landing second reverts with SaleChanged, uncharged.
        if (!sold && block.timestamp < end) revert SaleStillActive();
        // Every round ends with exactly one Sold or SaleCancelled event, so an off-chain history
        // never sees a round that just stops. An unsold round closed by a relaunch is logged as
        // cancelled (ended without a buyer).
        if (!sold) emit SaleCancelled(saleId, block.timestamp);
        _clearOutcome();
        _startSale(itemName, itemDescription, startPrice, endPrice, duration, stepDuration);
    }

    /// @notice Pulls the current sale before anyone has bought it, so the seller can start a
    /// different one instead (e.g. wrong price, wrong item, changed their mind). Only the original
    /// seller may call this, and only while the sale is still genuinely active : once it's sold
    /// there's nothing left to cancel, and it can't be cancelled twice.
    function cancelSale() external {
        if (msg.sender != seller) revert NotSeller();
        if (sold) revert AlreadySold();
        if (cancelled) revert AlreadyCancelled();
        cancelled = true;
        emit SaleCancelled(saleId, block.timestamp);
    }

    function _clearOutcome() internal {
        sold = false;
        buyer = address(0);
        soldPrice = 0;
        cancelled = false;
    }

    function _startSale(
        string memory _itemName,
        string memory _itemDescription,
        uint64 _startPrice,
        uint64 _endPrice,
        uint32 _duration,
        uint32 _stepDuration
    ) internal {
        if (_startPrice <= _endPrice) revert InvalidPriceRange();
        if (_duration == 0) revert ZeroDuration();
        // A step longer than the whole sale would mean no drop ever happens before the floor.
        // It doesn't have to divide _duration evenly: the last step is then just shorter.
        if (_stepDuration == 0 || _stepDuration > _duration) revert InvalidStepDuration();
        itemName = _itemName;
        itemDescription = _itemDescription;
        startPrice = _startPrice;
        endPrice = _endPrice;
        // Safe narrowing: block.timestamp fits in uint40 until the year 36812.
        startTime = uint40(block.timestamp);
        duration = _duration;
        stepDuration = _stepDuration;
        uint64 id = saleId + 1;
        saleId = id;
        emit SaleStarted(
            id, _itemName, _itemDescription, _startPrice, _endPrice, block.timestamp, _duration, _stepDuration
        );
    }

    /// @notice Current price: startPrice, then one equal drop every `stepDuration` seconds, down
    /// to endPrice once `duration` has elapsed. Each level is the straight-line price at the start
    /// of its step, so the price is constant for a whole step and a frontend can show exactly when
    /// the next drop happens and to what price.
    /// Reading `block.timestamp` here is safe: this only needs an approximate, non-decreasing wall
    /// clock to decide which step we're in, and Arc's timestamp guarantees exactly that (it never
    /// goes backwards). This is deliberately NOT using block.timestamp to order events or blocks :
    /// that would be the documented Arc pitfall, since sub-second blocks on Arc can share the same
    /// timestamp; ordering here is decided by transaction inclusion order in `buy()`, not by time.
    function currentPrice() public view returns (uint256) {
        // Widened to uint256 before any arithmetic: (2^64 price delta) * (2^32 elapsed seconds)
        // is far below 2^256, so no input the narrow storage types allow can overflow here.
        uint256 start = startTime;
        uint256 dur = duration;
        uint256 high = startPrice;
        uint256 low = endPrice;
        uint256 step = stepDuration;
        if (block.timestamp >= start + dur) return low;
        // Round elapsed time down to the start of the current step.
        uint256 elapsed = (block.timestamp - start) / step * step;
        uint256 drop = (high - low) * elapsed / dur;
        return high - drop;
    }

    /// @notice Buy the item at the current price using a single Permit2 signature.
    /// @param expectedSaleId The `saleId` the buyer was looking at. Reverts if that round has since
    /// been replaced (by the seller via startNewSale, or by anyone via relaunchSale), so a purchase can never land on a different item than the
    /// one the buyer decided to buy (see the comment in the function body).
    /// @param permit The Permit2 PermitTransferFrom the buyer signed off-chain. `permitted.token`
    /// must be USDC and `permitted.amount` should be set at or above the price the buyer saw when
    /// signing, to leave headroom against further decay before this transaction lands.
    /// @param signature The EIP-712 signature over `permit`, produced by the buyer's wallet off-chain.
    function buy(uint64 expectedSaleId, ISignatureTransfer.PermitTransferFrom calldata permit, bytes calldata signature)
        external
    {
        // The Permit2 signature binds this contract, a nonce, a deadline and a max amount : but
        // not *which* sale, since the same contract is reused across items. Without this check, a
        // buyer who signed for item A, then took a while to confirm in their wallet, could land
        // their transaction after A sold (or was cancelled) and the seller armed item B at a
        // price under their signed ceiling : buying B, which they never chose. The same applies to
        // a new round of the same item armed by relaunchSale. On Arc the whole "A sold ->
        // startNewSale(B)" sequence can finalize in about a second, so this window is real, not
        // theoretical. Checked first so that case reverts with the clearest reason.
        //
        // Any failure inside Permit2 itself (expired or reused signature, wrong signer...) is not
        // caught here: its own custom error (SignatureExpired, InvalidNonce, InvalidSigner...)
        // bubbles up unchanged as this call's revert data.
        uint64 id = saleId;
        if (expectedSaleId != id) revert SaleChanged(expectedSaleId, id);
        if (sold) revert AlreadySold();
        if (cancelled) revert SaleIsCancelled();
        if (permit.permitted.token != USDC) revert PermitTokenNotUSDC(permit.permitted.token);

        uint256 price = currentPrice();
        if (permit.permitted.amount < price) revert SignedAmountBelowPrice(permit.permitted.amount, price);

        // `sold` is locked before the external call to Permit2, both against reentrancy and because
        // this is the actual "first past the post" decision point of the auction. Arc has no public
        // mempool (eth_subscribe("newPendingTransactions") is disabled at the RPC level), so no
        // third-party bot can see this transaction before it finalizes and race a copy of it in
        // with a higher priority fee : front-running, the well-documented form of MEV that hits
        // time-sensitive sales on chains with a public mempool, structurally cannot happen here.
        // (Ordering within a block is still up to Arc's validators; what's removed is outside
        // observers.) Combined with Arc's deterministic sub-second finality, whichever buy()
        // transaction is included first is final and undisputed.
        sold = true;
        buyer = msg.sender;
        // Safe narrowing: currentPrice() never exceeds startPrice, itself a uint64.
        soldPrice = uint64(price);

        PERMIT2.permitTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: seller, requestedAmount: price}),
            msg.sender,
            signature
        );

        emit Sold(id, msg.sender, price, block.timestamp);
    }
}
