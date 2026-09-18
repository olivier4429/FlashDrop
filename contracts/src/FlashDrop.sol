// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISignatureTransfer} from "./interfaces/IPermit2.sol";

/// @title FlashDrop
/// @notice Single-product reverse Dutch auction: the displayed price decays linearly from
/// `startPrice` to `endPrice` over `duration` seconds, and the first `buy()` that lands wins the
/// item at whatever price was current at that instant. One contract instance = one product; to
/// sell a second item, deploy a new instance (no catalog/multi-item logic — see PROJECT_BRIEF.md).
contract FlashDrop {
    // USDC on Arc is both the ERC-20 interface (6 decimals, used here) and the native gas asset
    // (18 decimals, same underlying balance) — the two must never be mixed in a calculation. This
    // fixed address is the ERC-20 interface, confirmed via docs.arc.io / explorer.arc.io Blockscout
    // on 2026-09-17 (see docs/arc-notes/03-adresses-contrats.md); identical on mainnet and testnet.
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    // Permit2 is already deployed on Arc (same address on mainnet/testnet, see docs/arc-notes/03).
    // We use it instead of a plain approve()+buy() sequence: approve() is itself an on-chain
    // transaction, and on a price that is dropping every block, requiring the buyer to send one
    // transaction to approve and a second one to buy means the price has already moved between the
    // two. Permit2's permitTransferFrom() lets the buyer authorize the purchase with a single
    // off-chain EIP-712 signature (no gas, not a transaction) for "up to X USDC", and buy() below
    // pulls only the current, lower, displayed price in one single on-chain transaction.
    ISignatureTransfer public constant PERMIT2 = ISignatureTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    address public immutable seller;
    uint256 public immutable startPrice; // USDC, 6 decimals (ERC-20 interface)
    uint256 public immutable endPrice; // USDC, 6 decimals
    uint256 public immutable startTime;
    uint256 public immutable duration; // seconds

    bool public sold;
    address public buyer;
    uint256 public soldPrice;

    event Sold(address indexed buyer, uint256 price, uint256 timestamp);

    constructor(uint256 _startPrice, uint256 _endPrice, uint256 _duration) {
        require(_startPrice > _endPrice, "startPrice must exceed endPrice");
        require(_duration > 0, "duration must be positive");
        seller = msg.sender;
        startPrice = _startPrice;
        endPrice = _endPrice;
        startTime = block.timestamp;
        duration = _duration;
    }

    /// @notice Current price, decaying linearly from startPrice to endPrice over `duration`.
    /// Reading `block.timestamp` here is safe: this only needs an approximate, non-decreasing wall
    /// clock to compute a smooth price curve, and Arc's timestamp guarantees exactly that (it never
    /// goes backwards). This is deliberately NOT using block.timestamp to order events or blocks —
    /// that would be the documented Arc pitfall, since sub-second blocks on Arc can share the same
    /// timestamp; ordering here is decided by transaction inclusion order in `buy()`, not by time.
    function currentPrice() public view returns (uint256) {
        if (block.timestamp >= startTime + duration) return endPrice;
        uint256 elapsed = block.timestamp - startTime;
        uint256 drop = (startPrice - endPrice) * elapsed / duration;
        return startPrice - drop;
    }

    /// @notice Buy the item at the current price using a single Permit2 signature.
    /// @param permit The Permit2 PermitTransferFrom the buyer signed off-chain. `permitted.token`
    /// must be USDC and `permitted.amount` should be set at or above the price the buyer saw when
    /// signing, to leave headroom against further decay before this transaction lands.
    /// @param signature The EIP-712 signature over `permit`, produced by the buyer's wallet off-chain.
    function buy(ISignatureTransfer.PermitTransferFrom calldata permit, bytes calldata signature) external {
        require(!sold, "Already sold");
        require(permit.permitted.token == USDC, "Permit token must be USDC");

        uint256 price = currentPrice();
        require(permit.permitted.amount >= price, "Signed amount below current price");

        // `sold` is locked before the external call to Permit2, both against reentrancy and because
        // this is the actual "first past the post" decision point of the auction. Arc has no public
        // mempool (eth_subscribe("newPendingTransactions") is disabled at the RPC level), so no other
        // buyer's client can ever see this transaction before it finalizes and race a copy of it in
        // with higher gas — the classic "sniping" attack on time-based drops on mempool-visible
        // chains structurally cannot happen here. Combined with Arc's deterministic sub-second
        // finality, whichever buy() transaction is included first is final and undisputed.
        sold = true;
        buyer = msg.sender;
        soldPrice = price;

        PERMIT2.permitTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: seller, requestedAmount: price}),
            msg.sender,
            signature
        );

        emit Sold(msg.sender, price, block.timestamp);
    }
}
