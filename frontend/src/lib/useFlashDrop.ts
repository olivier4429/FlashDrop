import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address, createPublicClient, createWalletClient, custom, http, maxUint256 } from "viem";
import { activeChain, PERMIT2_ADDRESS, USDC_ADDRESS } from "./arcChain";
import { erc20Abi, flashDropAbi } from "./abi";

export interface SaleParams {
  startPrice: bigint;
  endPrice: bigint;
  startTime: bigint; // unix seconds
  duration: bigint; // seconds
}

export type BuyStatus =
  | "idle"
  | "connecting"
  | "checking-allowance"
  | "approving"
  | "signing"
  | "buying"
  | "done"
  | "error";

// Mirrors FlashDrop.currentPrice()'s linear decay so the UI can tick every animation frame
// without hitting the RPC on every render. This is only a client-side visual approximation of
// wall-clock time — the price actually charged is whatever the contract computes from
// block.timestamp at the moment `buy()` is included on-chain, not whatever this function returns.
function priceAtElapsed(sale: SaleParams, elapsedSeconds: bigint): bigint {
  if (elapsedSeconds >= sale.duration) return sale.endPrice;
  if (elapsedSeconds <= 0n) return sale.startPrice;
  const drop = ((sale.startPrice - sale.endPrice) * elapsedSeconds) / sale.duration;
  return sale.startPrice - drop;
}

function randomNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return value;
}

type ArcWalletClient = ReturnType<typeof createWalletClient>;

async function ensureArcChain(wallet: ArcWalletClient) {
  try {
    await wallet.switchChain({ id: activeChain.id });
  } catch {
    // Most wallets don't have a network as new as Arc pre-configured — add it, then switch.
    // Arc's native currency is USDC itself (the 18-decimal native interface), not a volatile
    // token; see arcChain.ts for why that's still a completely ordinary `defineChain` call.
    await wallet.addChain({ chain: activeChain });
    await wallet.switchChain({ id: activeChain.id });
  }
}

export function useFlashDrop(contractAddress: Address) {
  const publicClient = useMemo(() => createPublicClient({ chain: activeChain, transport: http() }), []);

  const [account, setAccount] = useState<Address | null>(null);
  const walletClientRef = useRef<ArcWalletClient | null>(null);

  const [sale, setSale] = useState<SaleParams | null>(null);
  const [sold, setSold] = useState(false);
  const [buyer, setBuyer] = useState<Address | null>(null);
  const [soldPrice, setSoldPrice] = useState<bigint | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [status, setStatus] = useState<BuyStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Immutable sale parameters never change after deployment — fetch once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [startPrice, endPrice, startTime, duration] = await Promise.all([
        publicClient.readContract({ address: contractAddress, abi: flashDropAbi, functionName: "startPrice" }),
        publicClient.readContract({ address: contractAddress, abi: flashDropAbi, functionName: "endPrice" }),
        publicClient.readContract({ address: contractAddress, abi: flashDropAbi, functionName: "startTime" }),
        publicClient.readContract({ address: contractAddress, abi: flashDropAbi, functionName: "duration" }),
      ]);
      if (!cancelled) setSale({ startPrice, endPrice, startTime, duration });
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, contractAddress]);

  // Polls the sale outcome. Arc finalizes deterministically in well under a second, so this short
  // interval doubles as a live demonstration of that speed: the UI flips to "sold" almost as fast
  // as the winning transaction lands, with nothing left ambiguous about who won.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [isSold, currentBuyer, price] = await Promise.all([
        publicClient.readContract({ address: contractAddress, abi: flashDropAbi, functionName: "sold" }),
        publicClient.readContract({ address: contractAddress, abi: flashDropAbi, functionName: "buyer" }),
        publicClient.readContract({ address: contractAddress, abi: flashDropAbi, functionName: "soldPrice" }),
      ]);
      if (cancelled) return;
      setSold(isSold);
      if (isSold) {
        setBuyer(currentBuyer);
        setSoldPrice(price);
      }
    };
    refresh();
    const interval = setInterval(refresh, 750);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient, contractAddress]);

  // Drives the live countdown display; stops once the item is sold.
  useEffect(() => {
    if (sold) return;
    const id = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(id);
  }, [sold]);

  const elapsedSeconds = sale
    ? BigInt(Math.max(0, Math.floor(nowMs / 1000) - Number(sale.startTime)))
    : 0n;
  const displayedPrice = sale ? priceAtElapsed(sale, elapsedSeconds) : null;
  const auctionEnded = sale ? elapsedSeconds >= sale.duration : false;

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const injected = (window as { ethereum?: Parameters<typeof custom>[0] }).ethereum;
      if (!injected) throw new Error("No wallet found — install MetaMask or a similar Arc-compatible wallet");
      const wallet = createWalletClient({ chain: activeChain, transport: custom(injected) });
      const [address] = await wallet.requestAddresses();
      await ensureArcChain(wallet);
      walletClientRef.current = wallet;
      setAccount(address);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  const buyNow = useCallback(async () => {
    const wallet = walletClientRef.current;
    if (!wallet || !account || !sale) return;
    setError(null);
    try {
      setStatus("checking-allowance");
      const allowance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, PERMIT2_ADDRESS],
      });

      // One-time, ever-lasting setup: approve Permit2 to move this wallet's USDC. This is the
      // ONLY on-chain approval a buyer ever makes — every purchase after this, on this or any
      // other FlashDrop instance, needs just an off-chain signature (see the `signTypedData` call
      // below, and FlashDrop.sol's comments on why Permit2 matters for a live decreasing price).
      if (allowance < sale.startPrice) {
        setStatus("approving");
        const approveHash = await wallet.writeContract({
          account,
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [PERMIT2_ADDRESS, maxUint256],
          chain: activeChain,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStatus("signing");
      const elapsedNow = BigInt(Math.max(0, Math.floor(Date.now() / 1000) - Number(sale.startTime)));
      // Sign for the price as of a few seconds "earlier" than what's displayed right now — a small
      // safety margin. The price only ever goes down, so this alone can't cause an overpay: the
      // contract still charges whatever currentPrice() actually is when buy() lands, never more
      // than this signed ceiling. Without the margin, a few seconds of network latency or client
      // clock drift between signing and the transaction landing could push the true on-chain price
      // fractionally past the exact instant that was displayed, causing an avoidable revert.
      const safetyMarginSeconds = BigInt(import.meta.env.VITE_PERMIT_SAFETY_MARGIN_SECONDS || "10");
      const permittedAmount = priceAtElapsed(
        sale,
        elapsedNow > safetyMarginSeconds ? elapsedNow - safetyMarginSeconds : 0n,
      );
      const nonce = randomNonce();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);

      const signature = await wallet.signTypedData({
        account,
        domain: {
          name: "Permit2",
          chainId: activeChain.id,
          verifyingContract: PERMIT2_ADDRESS,
        },
        types: {
          TokenPermissions: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          PermitTransferFrom: [
            { name: "permitted", type: "TokenPermissions" },
            { name: "spender", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "PermitTransferFrom",
        message: {
          permitted: { token: USDC_ADDRESS, amount: permittedAmount },
          spender: contractAddress,
          nonce,
          deadline,
        },
      });

      setStatus("buying");
      const buyHash = await wallet.writeContract({
        account,
        address: contractAddress,
        abi: flashDropAbi,
        functionName: "buy",
        args: [{ permitted: { token: USDC_ADDRESS, amount: permittedAmount }, nonce, deadline }, signature],
        chain: activeChain,
      });
      await publicClient.waitForTransactionReceipt({ hash: buyHash });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [account, sale, publicClient, contractAddress]);

  return { account, connect, sale, displayedPrice, auctionEnded, sold, buyer, soldPrice, status, error, buyNow };
}
