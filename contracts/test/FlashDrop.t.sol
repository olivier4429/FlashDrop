// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FlashDrop} from "../src/FlashDrop.sol";
import {ISignatureTransfer} from "../src/interfaces/IPermit2.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";

contract FlashDropTest is Test {
    // Must match the hardcoded constants in FlashDrop.sol exactly: the contract calls these
    // addresses directly, so the mocks are placed at these addresses via vm.etch rather than at
    // wherever `new MockUSDC()`/`new MockPermit2()` would normally deploy them.
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    string constant ITEM_NAME = "Test Item";
    string constant ITEM_DESCRIPTION = "A thing being sold in a test.";
    uint256 constant START_PRICE = 100e6; // 100 USDC
    uint256 constant END_PRICE = 10e6; // 10 USDC
    uint256 constant DURATION = 1000; // seconds

    address seller = makeAddr("seller");
    uint256 buyerPrivateKey = 0xB0B;
    address buyer;

    FlashDrop drop;

    function setUp() public {
        buyer = vm.addr(buyerPrivateKey);

        vm.etch(USDC, address(new MockUSDC()).code);
        vm.etch(PERMIT2, address(new MockPermit2()).code);

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
        drop.buy(permit, signature);

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
        drop.buy(permit, _signPermit(permit));

        address secondBuyer = vm.addr(0xC0FFEE);
        _fundAndApprove(secondBuyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit2 = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory sig2 = _signPermitAs(0xC0FFEE, permit2);

        vm.prank(secondBuyer);
        vm.expectRevert("Already sold");
        drop.buy(permit2, sig2);
    }

    function test_buy_revertsIfPermitTokenIsNotUSDC() public {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(0xDEAD), amount: START_PRICE}),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        bytes memory signature = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert("Permit token must be USDC");
        drop.buy(permit, signature);
    }

    function test_buy_revertsIfSignedAmountBelowCurrentPrice() public {
        // Buyer only signed for less than the item's starting (and thus current) price.
        ISignatureTransfer.PermitTransferFrom memory permit =
            _buildPermit(END_PRICE - 1, 0, block.timestamp + 1 hours);
        bytes memory signature = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert("Signed amount below current price");
        drop.buy(permit, signature);
    }

    function test_buy_revertsOnExpiredPermit() public {
        vm.warp(block.timestamp + 1000);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp - 1);
        bytes memory signature = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert("Permit expired");
        drop.buy(permit, signature);
    }

    function test_buy_revertsOnReusedNonce() public {
        // Buy legitimately against `drop`, consuming nonce 0 for this buyer.
        _fundAndApprove(buyer, START_PRICE * 2);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(permit, _signPermit(permit));

        // Permit2 nonces are scoped per owner (buyer), not per spender (contract) — so a buyer who
        // already used nonce 0 against one FlashDrop instance cannot reuse it against a second one
        // either, even with a freshly-signed permit for that second contract as spender.
        vm.prank(seller);
        FlashDrop secondDrop = new FlashDrop(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
        ISignatureTransfer.PermitTransferFrom memory replay = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        bytes memory replaySig = _signPermitFor(address(secondDrop), buyerPrivateKey, replay);

        vm.prank(buyer);
        vm.expectRevert("Nonce already used");
        secondDrop.buy(replay, replaySig);
    }

    // ---- startNewSale() ----

    function test_startNewSale_revertsIfNotSeller() public {
        _completeASale();
        vm.expectRevert("Only seller");
        drop.startNewSale(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
    }

    function test_startNewSale_revertsIfCurrentSaleStillActive() public {
        vm.prank(seller);
        vm.expectRevert("Current sale still active");
        drop.startNewSale(ITEM_NAME, ITEM_DESCRIPTION, START_PRICE, END_PRICE, DURATION);
    }

    function test_startNewSale_resetsStateForNextItem() public {
        _completeASale();

        string memory newItemName = "Second Item";
        string memory newItemDescription = "A different thing being sold.";
        uint256 newStartPrice = 50e6;
        uint256 newEndPrice = 5e6;
        uint256 newDuration = 500;

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
        drop.buy(permit, signature);

        assertTrue(drop.sold());
        assertEq(drop.buyer(), secondBuyer);
    }

    // ---- helpers ----

    function _completeASale() internal {
        _fundAndApprove(buyer, START_PRICE);
        ISignatureTransfer.PermitTransferFrom memory permit = _buildPermit(START_PRICE, 0, block.timestamp + 1 hours);
        vm.prank(buyer);
        drop.buy(permit, _signPermit(permit));
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

    // Reproduces MockPermit2's exact EIP-712 hashing so tests sign what the mock will actually
    // verify. `spender` is the contract that will call permitTransferFrom (msg.sender inside
    // Permit2), which binds a buyer's signature to one specific FlashDrop instance.
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
