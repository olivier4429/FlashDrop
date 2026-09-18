import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address, type Chain, createPublicClient, createWalletClient, custom, http, maxUint256 } from "viem";
import { PERMIT2_ADDRESS, USDC_ADDRESS } from "./arcChain";
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

async function ensureArcChain(wallet: ArcWalletClient, chain: Chain) {
  try {
    await wallet.switchChain({ id: chain.id });
  } catch {
    // Most wallets don't have a network as new as Arc pre-configured — add it, then switch.
    // Arc's native currency is USDC itself (the 18-decimal native interface), not a volatile
    // token; see arcChain.ts for why that's still a completely ordinary `defineChain` call.
    await wallet.addChain({ chain });
    await wallet.switchChain({ id: chain.id });
  }
}

export function useFlashDrop(contractAddress: Address, chain: Chain) {
  const publicClient = useMemo(() => createPublicClient({ chain, transport: http() }), [chain]);

  const [account, setAccount] = useState<Address | null>(null);
  const walletClientRef = useRef<ArcWalletClient | null>(null);

  const [sale, setSale] = useState<SaleParams | null>(null);
  const [sold, setSold] = useState(false);
  const [buyer, setBuyer] = useState<Address | null>(null);
  const [soldPrice, setSoldPrice] = useState<bigint | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [status, setStatus] = useState<BuyStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Null while the very first read is still in flight; a message once a read has actually failed
  // (e.g. VITE_FLASHDROP_ADDRESS points at a network the wallet isn't currently reading, since the
  // app uses one address across all networks in the dropdown rather than one per network).
  const [readError, setReadError] = useState<string | null>(null);

  // Switching network or contract (the dropdown in App.tsx) invalidates any existing wallet
  // connection — it was bound to a different chain, so force a fresh "Connect wallet" instead of
  // silently continuing to sign for the wrong network. Also drop any sale data read from whichever
  // network/contract was previously selected, so a failed read on the new one shows a clear error
  // instead of a frozen, stale price left over from before the switch.
  useEffect(() => {
    walletClientRef.current = null;
    setAccount(null);
    setStatus("idle");
    setSale(null);
    setReadError(null);
  }, [chain, contractAddress]);

  // Polls the full sale state, including startPrice/endPrice/startTime/duration — these aren't
  // truly immutable: the seller can reuse this same contract for a new item via startNewSale once
  // the current one sells (see FlashDrop.sol), so the frontend has to keep re-reading them rather
  // than fetching once and assuming they're fixed forever.
  //
  // Batched into a single `multicall` (Multicall3, deployed on Arc at the same canonical address
  // viem defaults to — see docs/arc-notes/03-adresses-contrats.md) instead of 7 separate eth_call
  // requests: Arc's public testnet RPC rate-limits (HTTP 429) a client polling this often with 7
  // parallel requests every cycle, which surfaced as a misleading "no contract found" error even
  // though the contract and address were both correct — one request per poll avoids that entirely.
  //
  // This self-schedules its next check (setTimeout, not setInterval) instead of polling forever at
  // a single fixed rate, so it only spends RPC calls when a fast response actually matters:
  //   - FAST (750ms) only while a sale is active and unsold — this is what lets the UI flip to
  //     "sold" almost as fast as the winning transaction lands, demonstrating Arc's speed.
  //   - SLOW (3s) once sold (waiting for a possible startNewSale), or after repeated read failures
  //     (a wrong address/network isn't going to fix itself by retrying faster).
  //   - PAUSED entirely while the tab isn't visible, resuming immediately when it is again.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let consecutiveFailures = 0;

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = setTimeout(refresh, delayMs);
    };

    const refresh = async () => {
      if (document.visibilityState === "hidden") {
        scheduleNext(3000); // just re-check visibility later; no RPC call while backgrounded
        return;
      }

      const results = await publicClient
        .multicall({
          contracts: [
            { address: contractAddress, abi: flashDropAbi, functionName: "startPrice" },
            { address: contractAddress, abi: flashDropAbi, functionName: "endPrice" },
            { address: contractAddress, abi: flashDropAbi, functionName: "startTime" },
            { address: contractAddress, abi: flashDropAbi, functionName: "duration" },
            { address: contractAddress, abi: flashDropAbi, functionName: "sold" },
            { address: contractAddress, abi: flashDropAbi, functionName: "buyer" },
            { address: contractAddress, abi: flashDropAbi, functionName: "soldPrice" },
          ],
          allowFailure: false,
        })
        .catch(() => null);

      if (cancelled) return;

      if (results === null) {
        consecutiveFailures += 1;
        // Don't flip to an error on a single transient blip (e.g. a brief RPC hiccup) — only after
        // a few polls in a row have failed, since a real "wrong address/network" case stays failed
        // indefinitely anyway.
        if (consecutiveFailures >= 3) {
          setReadError(`Could not read a FlashDrop contract at ${contractAddress} on ${chain.name}.`);
          setSale(null);
        }
        scheduleNext(3000);
        return;
      }
      consecutiveFailures = 0;

      const [startPrice, endPrice, startTime, duration, isSold, currentBuyer, price] = results;
      setReadError(null);
      setSale({ startPrice, endPrice, startTime, duration });
      setSold(isSold);
      setBuyer(isSold ? currentBuyer : null);
      setSoldPrice(isSold ? price : null);
      scheduleNext(isSold ? 3000 : 750);
    };

    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timeoutId);
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [publicClient, contractAddress, chain]);

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
      const wallet = createWalletClient({ chain, transport: custom(injected) });
      const [address] = await wallet.requestAddresses();
      await ensureArcChain(wallet, chain);
      walletClientRef.current = wallet;
      setAccount(address);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [chain]);

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
          chain,
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
          chainId: chain.id,
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
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: buyHash });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [account, sale, publicClient, contractAddress, chain]);

  return {
    account,
    connect,
    sale,
    displayedPrice,
    auctionEnded,
    sold,
    buyer,
    soldPrice,
    status,
    error,
    buyNow,
    readError,
  };
}
