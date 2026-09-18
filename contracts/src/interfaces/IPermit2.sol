// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal subset of Uniswap's Permit2 `ISignatureTransfer` — only the pieces FlashDrop
/// needs (a single-use, off-chain-signed transfer). Permit2 is already deployed on Arc mainnet
/// and testnet at the same address (see docs/arc-notes/03-adresses-contrats.md); this interface
/// just describes the parts of its ABI we call, it does not redeploy or reimplement anything.
interface ISignatureTransfer {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    /// @notice Transfers `transferDetails.requestedAmount` of `permit.permitted.token` from `owner`
    /// to `transferDetails.to`, authorized by `signature` (an EIP-712 signature over `permit` produced
    /// off-chain by `owner`). Reverts if the signature is invalid, expired, already consumed, or if
    /// `requestedAmount` exceeds `permit.permitted.amount`.
    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}
