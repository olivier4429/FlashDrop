import { defineChain } from "viem";

// Arc has no volatile native gas token: USDC itself is the native asset, exposed through two
// interfaces sharing one underlying balance — a "native" interface (18 decimals, what wallets
// show as the chain's native currency/gas balance) and an ERC-20 interface (6 decimals, the
// address below, used for every application-level transfer/approval). This chain definition's
// `nativeCurrency.decimals: 18` describes the native interface only, for wallet display purposes —
// every USDC amount this app computes or sends (price, allowance) uses the 6-decimal ERC-20
// interface instead. Mixing the two raw values would be off by a factor of 10^12.
// See docs/arc-notes/02-modele-stablecoin-gas.md.
const nativeCurrency = { name: "USDC", symbol: "USDC", decimals: 18 } as const;

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency,
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency,
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

// A generic local Hardhat node (`npx hardhat node`, see contracts/hardhat.config.ts's
// `localNode` network) — NOT Arc, just a plain EVM simulator for local development/testing
// without needing testnet funds. Native currency is a placeholder ETH, since there's no real
// USDC-as-gas model here.
export const localDev = defineChain({
  id: 31337,
  name: "Local Hardhat Node",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

// The networks selectable from the UI's network dropdown (see App.tsx). There's a single
// VITE_FLASHDROP_ADDRESS used regardless of which one is picked — in practice there's only ever
// one active deployment being tested at a time, so the dropdown just controls which chain the
// wallet/RPC talks to, not a separate address per network. If you deploy to two networks at once
// and need both addresses live simultaneously, that's the point where per-network address env
// vars would earn their keep — not needed for the current single-deployment workflow.
// Testnet listed first: it's the safe default while testing, so an unconfigured/misconfigured
// VITE_CHAIN_ID can't silently land the app on mainnet.
export const NETWORKS = [
  { chain: arcTestnet, label: "Arc Testnet" },
  { chain: arcMainnet, label: "Arc Mainnet" },
  { chain: localDev, label: "Local (Hardhat node)" },
] as const;

// Optional initial selection via VITE_CHAIN_ID (e.g. to default a deployed demo build to
// mainnet); falls back to Testnet (index 0) if unset or unrecognized.
export const DEFAULT_NETWORK_INDEX = Math.max(
  0,
  NETWORKS.findIndex((n) => String(n.chain.id) === import.meta.env.VITE_CHAIN_ID),
);

// USDC ERC-20 interface address — identical on Arc mainnet and testnet. Confirmed via
// docs.arc.io / explorer.arc.io Blockscout on 2026-09-17 (see docs/arc-notes/03-adresses-contrats.md).
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

// Permit2 — already deployed on Arc (same address on mainnet/testnet, see docs/arc-notes/03).
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
