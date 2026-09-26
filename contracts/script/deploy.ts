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

function envString(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const itemName = envString("ITEM_NAME");
const itemDescription = envString("ITEM_DESCRIPTION");
// uint64 on-chain (6-decimal USDC); viem rejects out-of-range values before sending anything.
const startPrice = envUint("START_PRICE"); // USDC, 6 decimals
const endPrice = envUint("END_PRICE"); // USDC, 6 decimals
// uint32 on-chain, which viem types as a plain number rather than a bigint.
const duration = Number(envUint("DURATION_SECONDS"));

// Uses whichever network was selected via `--network` (e.g. arcTestnet, arcMainnet, or the local
// hardhatMainnet simulator for a dry run) : see hardhat.config.ts.
const { viem } = await network.create();

const drop = await viem.deployContract("FlashDrop", [itemName, itemDescription, startPrice, endPrice, duration]);

console.log("FlashDrop deployed at:", drop.address);
console.log("itemName:", itemName, "itemDescription:", itemDescription);
console.log("startPrice:", startPrice.toString(), "endPrice:", endPrice.toString(), "duration:", duration.toString());
