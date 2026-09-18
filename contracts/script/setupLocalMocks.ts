import fs from "node:fs";
import { encodeFunctionData } from "viem";
import { network } from "hardhat";

// Local-testing helper: places minimal mock USDC/Permit2 contracts (the same ones the Solidity
// test suite uses, see contracts/test/mocks/) at the exact addresses FlashDrop hardcodes for the
// real Arc USDC and Permit2 deployments, then mints test USDC to a buyer address. This is what
// lets a real wallet (e.g. MetaMask on the local Hardhat node) exercise the full buy() flow
// without needing Arc testnet funds. See CLAUDE.md "Commands" > "Local end-to-end testing".
//
// Guarded to only ever run against a local dev chain — never against Arc testnet/mainnet, where
// USDC and Permit2 are real deployments that must never be overwritten.
const ALLOWED_LOCAL_CHAIN_IDS = [31337];

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Hardhat/Anvil's well-known first default test account — only ever meaningful on an ephemeral
// local chain, safe to hardcode. Override with TEST_BUYER_ADDRESS to mint to a different address
// instead (e.g. a MetaMask account you're testing with).
const DEFAULT_TEST_BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const mintFunctionAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const { viem } = await network.create({ network: "localNode" });
const publicClient = await viem.getPublicClient();

const chainId = await publicClient.getChainId();
if (!ALLOWED_LOCAL_CHAIN_IDS.includes(chainId)) {
  throw new Error(
    `Refusing to run: chain id ${chainId} is not a recognized local dev chain (expected one of ${ALLOWED_LOCAL_CHAIN_IDS.join(", ")}). ` +
      "This script overwrites the USDC/Permit2 addresses with test mocks — never run it against Arc testnet or mainnet.",
  );
}

const mockUsdcBytecode = JSON.parse(
  fs.readFileSync("artifacts/test/mocks/MockUSDC.sol/MockUSDC.json", "utf8"),
).deployedBytecode;
const mockPermit2Bytecode = JSON.parse(
  fs.readFileSync("artifacts/test/mocks/MockPermit2.sol/MockPermit2.json", "utf8"),
).deployedBytecode;

await publicClient.request({ method: "hardhat_setCode" as never, params: [USDC_ADDRESS, mockUsdcBytecode] as never });
await publicClient.request({
  method: "hardhat_setCode" as never,
  params: [PERMIT2_ADDRESS, mockPermit2Bytecode] as never,
});

const buyerAddress = (process.env.TEST_BUYER_ADDRESS || DEFAULT_TEST_BUYER) as `0x${string}`;
const mintAmount = BigInt(process.env.TEST_MINT_AMOUNT || "1000000000"); // default 1000 USDC (6dp)

const [funder] = await viem.getWalletClients();
const mintTx = await funder.sendTransaction({
  to: USDC_ADDRESS,
  data: encodeFunctionData({ abi: mintFunctionAbi, functionName: "mint", args: [buyerAddress, mintAmount] }),
});
await publicClient.waitForTransactionReceipt({ hash: mintTx });

console.log("Local mocks ready on chain", chainId);
console.log("Mock USDC + Permit2 placed at Arc's real addresses:", USDC_ADDRESS, PERMIT2_ADDRESS);
console.log("Minted", mintAmount.toString(), "USDC (6dp) to", buyerAddress);
console.log(
  "Next: import that address's private key into your wallet (Hardhat's default account #0 key if",
  "you used the default buyer). The one-time USDC -> Permit2 approval happens automatically on",
  "your first Buy click in the app.",
);
