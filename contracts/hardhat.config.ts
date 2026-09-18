import "dotenv/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// Arc mainnet/testnet RPC + chain IDs, from docs/arc-notes/01-fondamentaux-reseau.md.
// PRIVATE_KEY is read from the environment via `configVariable` (Hardhat's keystore/env
// mechanism) — never hardcoded, never committed. See contracts/.env.example.
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  paths: {
    // Foundry-style layout kept as-is (src/test/script) instead of Hardhat's default
    // contracts/test/scripts, to avoid reshuffling the already-verified contract and test
    // files when the project moved from Arc Foundry to Hardhat (see CLAUDE.md "Tech stack").
    sources: "src",
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
      },
      production: {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    // Local EVM simulator for fast unit tests. Note: this is a generic EVM, not Arc-aware —
    // see the "Tech stack" note in CLAUDE.md for why that's an accepted gap for this contract.
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("ARC_TESTNET_RPC_URL"),
      chainId: 5042002,
      accounts: [configVariable("PRIVATE_KEY")],
    },
    arcMainnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("ARC_MAINNET_RPC_URL"),
      chainId: 5042,
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
});
