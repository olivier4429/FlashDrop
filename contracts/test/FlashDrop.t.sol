// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FlashDrop} from "../src/FlashDrop.sol";
import {ISignatureTransfer} from "../src/interfaces/IPermit2.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract FlashDropTest is Test {
    // Must match the hardcoded constants in FlashDrop.sol exactly: the contract calls these
    // addresses directly, so the code under test is placed at these addresses via vm.etch.
    //  - USDC: a minimal ERC-20 mock (FlashDrop only ever touches USDC's ERC-20 side).
    //  - Permit2: NOT a mock — the exact runtime bytecode deployed at this address on Arc
    //    mainnet, so every test exercises the real signature checks, nonce bitmap and custom
    //    errors buyers will hit in production (see PERMIT2_BYTECODE_PATH below).
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Fetched with eth_getCode from rpc.mainnet.arc.io on 2026-09-25. Checked byte-for-byte
    // against the canonical Uniswap Permit2 on Ethereum mainnet (same address, same length): the
    // only differences are the two immutables baked in at deployment, the cached chain id (5042
    // vs 1) and the domain separator derived from it. Etching it onto a test chain with another
    // chain id is fine: Permit2 recomputes its domain separator whenever block.chainid differs
    // from the cached one. Readable from tests via fsPermissions in hardhat.config.ts.
    string constant PERMIT2_BYTECODE_PATH = "script/vendor/Permit2.deployedBytecode.txt";

    string constant ITEM_NAME = "Test Item";
    string constant ITEM_DESCRIPTION = "A thing being sold in a test.";
    uint64 constant START_PRICE = 100e6; // 100 USDC
    uint64 constant END_PRICE = 10e6; // 10 USDC
    uint32 constant DURATION = 1000; // seconds

    address seller = makeAddr("seller");
    uint256 buyerPrivateKey = 0xB0B;
    address buyer;

    FlashDrop drop;

    function setUp() public {
        buyer = vm.addr(buyerPrivateKey);

        vm.etch(USDC, address(new MockUSDC()).code);
        vm.etch(PERMIT2, vm.parseBytes(vm.trim(vm.readFile(PERMIT2_BYTECODE_PATH))));

        vm.prank(seller);
        drop = new FlashDrop(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
    }

    // ---- currentPrice() ----

    function test_currentPrice_atStart() public view {
        assertEq(drop.currentPrice(), START_PRICE);
    }

    function test_currentPrice_atMidpoint() public {
        vm.warp(block.timestamp + DURATION / 2);
        // Linear decay: halfway through, price is halfway between start and end.
        assertEq(drop.currentPrice(), (START_PRICE + END_PRICE) / 2);
    }

    function test_currentPrice_afterEnd() public {
        vm.warp(block.timestamp + DURATION + 1);
        assertEq(drop.currentPrice(), END_PRICE);
    }

    // ---- buy() happy path ----

    function test_buy_transfersCurrentPriceAndRecordsWinner() public {
        vm.warp(block.timestamp + DURATION / 2);
        uint256 expectedPrice = drop.currentPrice();

        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory signature = _signPermit(permit);

        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, signature);

        assertTrue(drop.sold());
        assertEq(drop.buyer(), buyer);
        assertEq(drop.soldPrice(), expectedPrice);
        assertEq(MockUSDC(USDC).balanceOf(seller), expectedPrice);
        assertEq(MockUSDC(USDC).balanceOf(buyer), START_PRICE - expectedPrice);
    }

    // ---- buy() revert paths ----

    function test_buy_revertsIfAlreadySold() public {
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, _signPermit(permit));

        address secondBuyer = vm.addr(0xC0FFEE);
        _fundAndApprove(secondBuyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit2 = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory sig2 = _signPermitAs(0xC0FFEE, permit2);

        vm.prank(secondBuyer);
        vm.expectRevert(FlashDrop.AlreadySold.selector);
        drop.buy(_saleId(drop), permit2, sig2);
    }

    function test_buy_revertsIfPermitTokenIsNotUSDC() public {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(0xDEAD), amount: START_PRICE}),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        bytes memory signature = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FlashDrop.PermitTokenNotUSDC.selector, address(0xDEAD)));
        drop.buy(_saleId(drop), permit, signature);
    }

    function test_buy_revertsIfSignedAmountBelowCurrentPrice() public {
        // Buyer only signed for less than even the floor price, so below the current price at any
        // point in the sale (here, the start price).
        ISignatureTransfer.PermitTransferFrom memory permit =
            _buildPermit(END_PRICE - 1, 0, block.timestamp + 1 hours);
        bytes memory signature = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(FlashDrop.SignedAmountBelowPrice.selector, END_PRICE - 1, START_PRICE)
        );
        drop.buy(_saleId(drop), permit, signature);
    }

    function test_buy_revertsOnExpiredPermit() public {
        vm.warp(block.timestamp + 1000);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp - 1);
        bytes memory signature = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ISignatureTransfer.SignatureExpired.selector, permit.deadline));
        drop.buy(_saleId(drop), permit, signature);
    }

    function test_buy_revertsOnReusedNonce() public {
        // Buy legitimately against `drop`, consuming nonce 0 for this buyer.
        _fundAndApprove(buyer, START_PRICE * 2);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, _signPermit(permit));

        // Permit2 nonces are scoped per owner (buyer), not per spender (contract) — so a buyer who
        // already used nonce 0 against one FlashDrop instance cannot reuse it against a second one
        // either, even with a freshly-signed permit for that second contract as spender.
        vm.prank(seller);
        FlashDrop secondDrop = new FlashDrop(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
        ISignatureTransfer.PermitTransferFrom memory replay = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory replaySig = _signPermitFor(address(secondDrop), buyerPrivateKey, replay);

        vm.prank(buyer);
        vm.expectRevert(ISignatureTransfer.InvalidNonce.selector);
        secondDrop.buy(_saleId(secondDrop), replay, replaySig);
    }

    // ---- cancelSale() ----

    function test_cancelSale_revertsIfNotSeller() public {
        vm.expectRevert(FlashDrop.NotSeller.selector);
        drop.cancelSale();
    }

    function test_cancelSale_revertsIfAlreadySold() public {
        _completeASale();
        vm.prank(seller);
        vm.expectRevert(FlashDrop.AlreadySold.selector);
        drop.cancelSale();
    }

    function test_cancelSale_revertsIfAlreadyCancelled() public {
        vm.prank(seller);
        drop.cancelSale();

        vm.prank(seller);
        vm.expectRevert(FlashDrop.AlreadyCancelled.selector);
        drop.cancelSale();
    }

    function test_cancelSale_setsCancelledAndBlocksBuy() public {
        vm.prank(seller);
        drop.cancelSale();

        assertTrue(drop.cancelled());
        assertFalse(drop.sold());

        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        vm.expectRevert(FlashDrop.SaleIsCancelled.selector);
        drop.buy(_saleId(drop), permit, _signPermit(permit));
    }

    function test_cancelSale_letsSellerStartNewSaleWithoutASale() public {
        vm.prank(seller);
        drop.cancelSale();

        string memory newItemName = "Replacement Item";
        vm.prank(seller);
        drop.startNewSale(newItemName, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);

        assertFalse(drop.cancelled());
        assertEq(drop.itemName(), newItemName);

        // The replaced sale is buyable normally.
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, _signPermit(permit));
        assertTrue(drop.sold());
    }

    // ---- startNewSale() ----

    function test_startNewSale_revertsIfNotSeller() public {
        _completeASale();
        vm.expectRevert(FlashDrop.NotSeller.selector);
        drop.startNewSale(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
    }

    function test_startNewSale_revertsIfCurrentSaleStillActive() public {
        vm.prank(seller);
        vm.expectRevert(FlashDrop.SaleStillActive.selector);
        drop.startNewSale(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
    }

    function test_startNewSale_resetsStateForNextItem() public {
        _completeASale();

        string memory newItemName = "Second Item";
        string memory newItemDescription = "A different thing being sold.";
        uint64 newStartPrice = 50e6;
        uint64 newEndPrice = 5e6;
        uint32 newDuration = 500;

        vm.prank(seller);
        drop.startNewSale(newItemName, newItemDescription, newStartPrice, newEndPrice, newDuration);

        assertFalse(drop.sold());
        assertEq(drop.buyer(), address(0));
        assertEq(drop.soldPrice(), 0);
        assertEq(drop.itemName(), newItemName);
        assertEq(drop.itemDescription(), newItemDescription);
        assertEq(drop.startPrice(), newStartPrice);
        assertEq(drop.endPrice(), newEndPrice);
        assertEq(drop.duration(), newDuration);
        assertEq(drop.currentPrice(), newStartPrice);

        // The same contract instance can now be bought again, by a different buyer.
        address secondBuyer = vm.addr(0xC0FFEE);
        MockUSDC(USDC).mint(secondBuyer, newStartPrice);
        vm.prank(secondBuyer);
        MockUSDC(USDC).approve(PERMIT2, type(uint256).max);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(newStartPrice, 1, block.timestamp + 1 hours);
        bytes memory signature = _signPermitFor(address(drop), 0xC0FFEE, permit);

        vm.prank(secondBuyer);
        drop.buy(_saleId(drop), permit, signature);

        assertTrue(drop.sold());
        assertEq(drop.buyer(), secondBuyer);
    }

    // ---- M-1: a purchase is bound to one specific sale ----

    function test_startSale_incrementsSaleId() public {
        assertEq(drop.saleId(), 1);
        _completeASale();
        vm.prank(seller);
        drop.startNewSale(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
        assertEq(drop.saleId(), 2);
    }

    function test_buy_revertsIfSaleReplacedAfterSigning() public {
        // Buyer looks at sale 1 and signs a generous ceiling for it...
        uint64 seenSaleId = _saleId(drop);
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory signature = _signPermit(permit);

        // ...but before their transaction lands, the seller pulls it and arms a different item
        // whose price is still under that ceiling.
        vm.startPrank(seller);
        drop.cancelSale();
        drop.startNewSale("Different Item", ITEM_DESCRIPTION, START_PRICE / 2, END_PRICE, DURATION);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FlashDrop.SaleChanged.selector, seenSaleId, uint64(2)));
        drop.buy(seenSaleId, permit, signature);
    }

    // ---- buy() edge cases ----

    function test_buy_afterDurationPaysEndPrice() public {
        vm.warp(block.timestamp + DURATION * 10);
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, _signPermit(permit));

        assertEq(drop.soldPrice(), END_PRICE);
        assertEq(MockUSDC(USDC).balanceOf(seller), END_PRICE);
    }

    function test_buy_succeedsWithSignedAmountExactlyAtCurrentPrice() public {
        vm.warp(block.timestamp + DURATION / 4);
        uint256 price = drop.currentPrice();
        _fundAndApprove(buyer, price);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(price, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, _signPermit(permit));

        assertEq(MockUSDC(USDC).balanceOf(buyer), 0);
    }

    function test_buy_revertsIfSubmittedBySomeoneOtherThanTheSigner() public {
        // Permit2 is told `owner = msg.sender`, so a signature lifted from the real buyer is
        // useless to anyone else: it recovers to an address other than the caller.
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory signature = _signPermit(permit);

        address thief = makeAddr("thief");
        vm.prank(thief);
        vm.expectRevert(ISignatureTransfer.InvalidSigner.selector);
        drop.buy(_saleId(drop), permit, signature);
    }

    function test_buy_emitsSold() public {
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory signature = _signPermit(permit);

        vm.expectEmit(address(drop));
        emit FlashDrop.Sold(1, buyer, START_PRICE, block.timestamp);
        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, signature);
    }

    // ---- _startSale() validation ----

    function test_constructor_revertsIfStartPriceNotAboveEndPrice() public {
        vm.expectRevert(FlashDrop.InvalidPriceRange.selector);
        new FlashDrop(ITEM_NAME, ITEM_DESCRIPTION, END_PRICE, END_PRICE, DURATION);
    }

    function test_constructor_revertsIfDurationZero() public {
        vm.expectRevert(FlashDrop.ZeroDuration.selector);
        new FlashDrop(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, 0);
    }

    function test_startNewSale_revertsOnInvalidParams() public {
        _completeASale();
        vm.startPrank(seller);
        vm.expectRevert(FlashDrop.InvalidPriceRange.selector);
        drop.startNewSale(ITEM_NAME, ITEM_DESCRIPTION, END_PRICE, START_PRICE, DURATION);
        vm.expectRevert(FlashDrop.ZeroDuration.selector);
        drop.startNewSale(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, 0);
        vm.stopPrank();
    }

    function test_startNewSale_emitsSaleStarted() public {
        _completeASale();
        vm.expectEmit(address(drop));
        emit FlashDrop.SaleStarted(2, "Next", "Desc", 50e6, 5e6, block.timestamp, 500);
        vm.prank(seller);
        drop.startNewSale("Next", "Desc", 50e6, 5e6, 500);
    }

    function test_cancelSale_emitsSaleCancelled() public {
        vm.expectEmit(address(drop));
        emit FlashDrop.SaleCancelled(1, block.timestamp);
        vm.prank(seller);
        drop.cancelSale();
    }

    // ---- currentPrice() properties (fuzzed) ----

    /// Over the full range of the narrow storage types: the price never rises as time passes, and
    /// always stays within [endPrice, startPrice] — which is also what makes buy()'s
    /// uint64(price) narrowing safe.
    function testFuzz_currentPrice_monotonicAndBounded(uint64 high, uint64 low, uint32 dur, uint32 t1, uint32 t2)
        public
    {
        vm.assume(high > low && dur > 0);
        (t1, t2) = t1 <= t2 ? (t1, t2) : (t2, t1);

        vm.prank(seller);
        FlashDrop d = new FlashDrop(ITEM_NAME, ITEM_DESCRIPTION, high, low, dur);
        uint256 t0 = block.timestamp;

        vm.warp(t0 + t1);
        uint256 p1 = d.currentPrice();
        vm.warp(t0 + t2);
        uint256 p2 = d.currentPrice();

        assertLe(p2, p1);
        assertLe(p1, high);
        assertGe(p2, low);
    }

    // ---- storage layout ----

    /// Locks in the 2-slot packing documented in FlashDrop.sol: if a field is reordered or
    /// widened, buy() silently goes back to touching more cold slots, and this test catches it.
    function test_storageLayout_isPacked() public {
        _completeASale();

        uint256 slot0 = uint256(vm.load(address(drop), bytes32(uint256(0))));
        assertEq(address(uint160(slot0)), buyer, "slot0: buyer");
        assertEq(uint40(slot0 >> 160), drop.startTime(), "slot0: startTime");
        assertEq(uint32(slot0 >> 200), drop.duration(), "slot0: duration");
        assertEq(uint8(slot0 >> 232), 1, "slot0: sold");
        assertEq(uint8(slot0 >> 240), 0, "slot0: cancelled");

        uint256 slot1 = uint256(vm.load(address(drop), bytes32(uint256(1))));
        assertEq(uint64(slot1), START_PRICE, "slot1: startPrice");
        assertEq(uint64(slot1 >> 64), END_PRICE, "slot1: endPrice");
        assertEq(uint64(slot1 >> 128), drop.soldPrice(), "slot1: soldPrice");
        assertEq(uint64(slot1 >> 192), 1, "slot1: saleId");
    }

    // ---- helpers ----

    // Reads saleId straight from storage (slot 1, top 64 bits) rather than calling drop.saleId():
    // an external call placed as a buy() argument would be the call that consumes a preceding
    // vm.prank, while vm.load is a cheatcode and doesn't.
    function _saleId(FlashDrop d) internal view returns (uint64) {
        return uint64(uint256(vm.load(address(d), bytes32(uint256(1)))) >> 192);
    }

    function _completeASale() internal {
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(_saleId(drop), permit, _signPermit(permit));
    }

    function _fundAndApprove(address account, uint256 amount) internal {
        MockUSDC(USDC).mint(account, amount);
        // Real-world equivalent of the one-time, ever-lasting approve(Permit2, max) a wallet does
        // once before its first Permit2-based purchase — every purchase after that needs only a
        // signature, never another on-chain approval.
        vm.prank(account);
        MockUSDC(USDC).approve(PERMIT2, type(uint256).max);
    }

    function _buildPermit(uint256 amount, uint256 nonce, uint256 deadline)
        internal
        pure
        returns (ISignatureTransfer.PermitTransferFrom memory)
    {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: USDC, amount: amount}),
            nonce: nonce,
            deadline: deadline
        });
    }

    function _signPermit(ISignatureTransfer.PermitTransferFrom memory permit) internal view returns (bytes memory) {
        return _signPermitFor(address(drop), buyerPrivateKey, permit);
    }

    function _signPermitAs(uint256 privateKey, ISignatureTransfer.PermitTransferFrom memory permit)
        internal
        view
        returns (bytes memory)
    {
        return _signPermitFor(address(drop), privateKey, permit);
    }

    // Reproduces Permit2's EIP-712 hashing for PermitTransferFrom (no witness), exactly what the
    // real contract etched in setUp() verifies. `spender` is the contract that will call
    // permitTransferFrom (msg.sender inside Permit2), which binds a buyer's signature to one
    // specific FlashDrop instance.
    function _signPermitFor(address spender, uint256 privateKey, ISignatureTransfer.PermitTransferFrom memory permit)
        internal
        view
        returns (bytes memory)
    {
        bytes32 tokenPermissionsHash = keccak256(
            abi.encode(
                keccak256("TokenPermissions(address token,uint256 amount)"), permit.permitted.token, permit.permitted.amount
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
                ),
                tokenPermissionsHash,
                spender,
                permit.nonce,
                permit.deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256("Permit2"),
                block.chainid,
                PERMIT2
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
