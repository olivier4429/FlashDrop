import { network } from "hardhat";

// Reuses an already-deployed FlashDrop instance for a new item, instead of deploying a fresh
// contract per item (see FlashDrop.sol's startNewSale — only callable by the original seller,
// and only once the current sale has sold or been cancelled).
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

const contractAddress = process.env.FLASHDROP_ADDRESS as `0x${string}` | undefined;
if (!contractAddress) {
  throw new Error("Missing required env var: FLASHDROP_ADDRESS");
}

const itemName = envString("ITEM_NAME");
const itemDescription = envString("ITEM_DESCRIPTION");
// uint64 on-chain (6-decimal USDC); viem rejects out-of-range values before sending anything.
const startPrice = envUint("START_PRICE"); // USDC, 6 decimals
const endPrice = envUint("END_PRICE"); // USDC, 6 decimals
// uint32 on-chain, which viem types as a plain number rather than a bigint.
const duration = Number(envUint("DURATION_SECONDS"));

const { viem } = await network.create();
const drop = await viem.getContractAt("FlashDrop", contractAddress);

const hash = await drop.write.startNewSale([itemName, itemDescription, startPrice, endPrice, duration]);
const publicClient = await viem.getPublicClient();
await publicClient.waitForTransactionReceipt({ hash });

console.log("New sale started on", contractAddress);
console.log("itemName:", itemName, "itemDescription:", itemDescription);
console.log("startPrice:", startPrice.toString(), "endPrice:", endPrice.toString(), "duration:", duration.toString());
