// Hand-maintained to mirror contracts/src/FlashDrop.sol exactly. The frontend and the contract
// are separate npm packages with no shared build step in this MVP, so keep this in sync by hand
// whenever FlashDrop.sol's public interface changes.
export const flashDropAbi = [
  { type: "function", name: "seller", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "itemName", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "itemDescription", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "startPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "endPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "startTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "duration", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sold", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "cancelled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "buyer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "soldPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
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
      { name: "_startPrice", type: "uint256" },
      { name: "_endPrice", type: "uint256" },
      { name: "_duration", type: "uint256" },
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
      { name: "buyer", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SaleStarted",
    inputs: [
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
    inputs: [{ name: "timestamp", type: "uint256", indexed: false }],
  },
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
