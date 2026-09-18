// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISignatureTransfer} from "../../src/interfaces/IPermit2.sol";

interface IERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Minimal, faithful reimplementation of Uniswap's Permit2 `SignatureTransfer`, covering
/// only the single-token `permitTransferFrom` path FlashDrop uses (EIP-712 signature check, a
/// single-use nonce, a deadline, and the "requestedAmount <= permitted.amount" partial-fill rule).
/// This is a test double, NOT the audited production Permit2 contract — it exists so unit tests can
/// exercise real EIP-712 signature verification without vendoring the full Permit2 source tree.
///
/// It is deployed via `vm.etch` onto the real Permit2 constant address in FlashDrop.t.sol (so that
/// FlashDrop's hardcoded `PERMIT2` address resolves to this code during tests). Because `vm.etch`
/// copies bytecode without re-running a constructor, DOMAIN_SEPARATOR is computed on the fly from
/// `address(this)` and `block.chainid` rather than cached as an immutable at construction time —
/// an immutable baked in at this contract's original deployment address would be wrong once the
/// code is moved to a different address.
contract MockPermit2 is ISignatureTransfer {
    bytes32 public constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");

    // Matches Uniswap Permit2's real typehash for the single-token PermitTransferFrom struct,
    // including binding the signature to `spender` (the contract calling permitTransferFrom) so a
    // buyer's signature for one FlashDrop instance can't be replayed against another.
    bytes32 public constant PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );

    mapping(address => mapping(uint256 => bool)) public usedNonces;

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256("Permit2"),
                block.chainid,
                address(this)
            )
        );
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external override {
        require(block.timestamp <= permit.deadline, "Permit expired");
        require(!usedNonces[owner][permit.nonce], "Nonce already used");
        require(transferDetails.requestedAmount <= permit.permitted.amount, "Amount exceeds permitted");

        usedNonces[owner][permit.nonce] = true;

        bytes32 tokenPermissionsHash =
            keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, permit.permitted.token, permit.permitted.amount));
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, tokenPermissionsHash, msg.sender, permit.nonce, permit.deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));

        require(_recoverSigner(digest, signature) == owner, "Invalid signature");

        require(
            IERC20Like(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount),
            "Transfer failed"
        );
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}
