// Hand-maintained to mirror contracts/src/FlashDrop.sol exactly. The frontend and the contract
// are separate npm packages with no shared build step in this MVP, so keep this in sync by hand
// whenever FlashDrop.sol's public interface changes.
export const flashDropAbi = [
  { type: "function", name: "seller", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "itemName", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "itemDescription", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "startPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "endPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "startTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint40" }] },
  { type: "function", name: "duration", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "sold", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "cancelled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "buyer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "soldPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "saleId", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "currentPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "expectedSaleId", type: "uint64" },
      {
        name: "permit",
        type: "tuple",
        components: [
          {
            name: "permitted",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "startNewSale",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_itemName", type: "string" },
      { name: "_itemDescription", type: "string" },
      { name: "_startPrice", type: "uint64" },
      { name: "_endPrice", type: "uint64" },
      { name: "_duration", type: "uint32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelSale",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "Sold",
    inputs: [
      { name: "saleId", type: "uint64", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SaleStarted",
    inputs: [
      { name: "saleId", type: "uint64", indexed: true },
      { name: "itemName", type: "string", indexed: false },
      { name: "itemDescription", type: "string", indexed: false },
      { name: "startPrice", type: "uint256", indexed: false },
      { name: "endPrice", type: "uint256", indexed: false },
      { name: "startTime", type: "uint256", indexed: false },
      { name: "duration", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SaleCancelled",
    inputs: [
      { name: "saleId", type: "uint64", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  // FlashDrop's own custom errors : viem needs them in the ABI to decode a revert into a name
  // (and arguments) instead of an opaque 4-byte selector.
  { type: "error", name: "NotSeller", inputs: [] },
  { type: "error", name: "SaleStillActive", inputs: [] },
  { type: "error", name: "AlreadySold", inputs: [] },
  { type: "error", name: "AlreadyCancelled", inputs: [] },
  { type: "error", name: "SaleIsCancelled", inputs: [] },
  {
    type: "error",
    name: "SaleChanged",
    inputs: [
      { name: "expectedSaleId", type: "uint64" },
      { name: "currentSaleId", type: "uint64" },
    ],
  },
  { type: "error", name: "PermitTokenNotUSDC", inputs: [{ name: "token", type: "address" }] },
  {
    type: "error",
    name: "SignedAmountBelowPrice",
    inputs: [
      { name: "signedAmount", type: "uint256" },
      { name: "currentPrice", type: "uint256" },
    ],
  },
  { type: "error", name: "InvalidPriceRange", inputs: [] },
  { type: "error", name: "ZeroDuration", inputs: [] },
  // Permit2's errors, which bubble up unchanged through buy() (FlashDrop doesn't catch them).
  // Not part of FlashDrop's compiled ABI : mirrored from ISignatureTransfer in
  // contracts/src/interfaces/IPermit2.sol, where their provenance is documented.
  { type: "error", name: "SignatureExpired", inputs: [{ name: "signatureDeadline", type: "uint256" }] },
  { type: "error", name: "InvalidNonce", inputs: [] },
  { type: "error", name: "InvalidAmount", inputs: [{ name: "maxAmount", type: "uint256" }] },
  { type: "error", name: "InvalidSignatureLength", inputs: [] },
  { type: "error", name: "InvalidSignature", inputs: [] },
  { type: "error", name: "InvalidSigner", inputs: [] },
  { type: "error", name: "InvalidContractSignature", inputs: [] },
] as const;

// Minimal ERC-20 surface needed for the one-time Permit2 allowance setup (see useFlashDrop.ts).
export const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
