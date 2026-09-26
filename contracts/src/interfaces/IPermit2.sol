// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal subset of Uniswap's Permit2 `ISignatureTransfer` : only the pieces FlashDrop
/// needs (a single-use, off-chain-signed transfer). Permit2 is already deployed on Arc mainnet
/// and testnet at the same address (see docs/arc-notes/03-adresses-contrats.md); this interface
/// just describes the parts of its ABI we call, it does not redeploy or reimplement anything.
interface ISignatureTransfer {
    // Custom errors the real Permit2 reverts with on the permitTransferFrom path, bubbled up
    // unchanged through FlashDrop.buy(). Declared here so tests can expect them and so they can
    // be mirrored into the frontend ABI for readable error messages. Names and signatures from
    // Uniswap's Permit2 source (PermitErrors.sol, ISignatureTransfer.sol, SignatureVerification.sol);
    // every selector confirmed present in the bytecode deployed at the Permit2 address on Arc
    // mainnet on 2026-09-25 (see contracts/script/vendor/Permit2.deployedBytecode.txt).
    error SignatureExpired(uint256 signatureDeadline);
    error InvalidNonce();
    error InvalidAmount(uint256 maxAmount);
    error InvalidSignatureLength();
    error InvalidSignature();
    error InvalidSigner();
    error InvalidContractSignature();

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
