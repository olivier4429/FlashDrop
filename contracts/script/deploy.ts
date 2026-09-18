import { network } from "hardhat";

// Sale parameters come from the environment so the same script deploys any single-product drop
// without editing source. Run this once per contract instance; for every item after the first
// one, reuse the same deployed instance with script/startNewSale.ts instead of deploying again.
function envUint(name: string): bigint {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return BigInt(value);
}

const startPrice = envUint("START_PRICE"); // USDC, 6 decimals
const endPrice = envUint("END_PRICE"); // USDC, 6 decimals
const duration = envUint("DURATION_SECONDS");

// Uses whichever network was selected via `--network` (e.g. arcTestnet, arcMainnet, or the local
// hardhatMainnet simulator for a dry run) — see hardhat.config.ts.
const { viem } = await network.create();

const drop = await viem.deployContract("FlashDrop", [startPrice, endPrice, duration]);

console.log("FlashDrop deployed at:", drop.address);
console.log("startPrice:", startPrice.toString(), "endPrice:", endPrice.toString(), "duration:", duration.toString());
