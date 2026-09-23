import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address, type Chain, createPublicClient, createWalletClient, custom, http, maxUint256 } from "viem";
import { PERMIT2_ADDRESS, USDC_ADDRESS } from "./arcChain";
import { erc20Abi, flashDropAbi } from "./abi";

export interface SaleParams {
  itemName: string;
  itemDescription: string;
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

export type AdminStatus = "idle" | "starting" | "cancelling" | "done" | "error";

export interface NewSaleInput {
  itemName: string;
  itemDescription: string;
  startPrice: bigint;
  endPrice: bigint;
  durationSeconds: bigint;
}

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
  // Tracks `sold` across polls (independent of React state staleness inside the poll's closure —
  // see below) so a true->false transition (a new sale just got armed via startNewSale) can be
  // told apart from "still unsold". Used only to reset the connected wallet's own buy status: this
  // is what stops the buy button reading "Purchased!" for a new item after the same wallet bought
  // a previous one in this session — see the reset below.
  const prevSoldRef = useRef<boolean | null>(null);

  const [seller, setSeller] = useState<Address | null>(null);
  const [sale, setSale] = useState<SaleParams | null>(null);
  const [sold, setSold] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [buyer, setBuyer] = useState<Address | null>(null);
  const [soldPrice, setSoldPrice] = useState<bigint | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [status, setStatus] = useState<BuyStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [adminStatus, setAdminStatus] = useState<AdminStatus>("idle");
  const [adminError, setAdminError] = useState<string | null>(null);
  // Which admin action `adminStatus === "done"` refers to. Deliberately NOT inferred from the
  // polled `sold`/`cancelled` state at display time — that poll can lag up to 750ms behind the tx
  // actually confirming, so right after starting a new sale (which resets `cancelled` on-chain),
  // the frontend could still be showing a stale `cancelled === true` for a moment and mislabel the
  // success message "Sale cancelled." instead of "New sale started.".
  const [adminAction, setAdminAction] = useState<"start" | "cancel" | null>(null);
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
    setSeller(null);
    setSale(null);
    setCancelled(false);
    setReadError(null);
    prevSoldRef.current = null;
  }, [chain, contractAddress]);

  // Polls the full sale state, including itemName/itemDescription/startPrice/endPrice/startTime/
  // duration — none of these are truly immutable: the seller can reuse this same contract for a
  // new item via startNewSale once the current one sells (see FlashDrop.sol), so the frontend has
  // to keep re-reading them rather than fetching once and assuming they're fixed forever. This is
  // also why the item's title/description live on-chain at all rather than only in frontend
  // config — a frontend-only value could otherwise show the previous item's name next to the new
  // item's price right after a startNewSale.
  //
  // Batched into a single `multicall` (Multicall3, deployed on Arc at the standard canonical
  // address, configured per chain in arcChain.ts — viem has no global default; see
  // docs/arc-notes/03-adresses-contrats.md) instead of 11 separate eth_call
  // requests: Arc's public testnet RPC rate-limits (HTTP 429) a client polling this often with many
  // parallel requests every cycle, which surfaced as a misleading "no contract found" error even
  // though the contract and address were both correct — one request per poll avoids that entirely.
  //
  // This self-schedules its next check (setTimeout, not setInterval) instead of polling forever at
  // a single fixed rate, so it only spends RPC calls when a fast response actually matters:
  //   - FAST (750ms) whenever the sale is unsold (including a cancelled one, which isn't
  //     distinguished here) — this is what lets the UI flip to "sold" almost as fast as the
  //     winning transaction lands, demonstrating Arc's speed.
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
            { address: contractAddress, abi: flashDropAbi, functionName: "seller" },
            { address: contractAddress, abi: flashDropAbi, functionName: "itemName" },
            { address: contractAddress, abi: flashDropAbi, functionName: "itemDescription" },
            { address: contractAddress, abi: flashDropAbi, functionName: "startPrice" },
            { address: contractAddress, abi: flashDropAbi, functionName: "endPrice" },
            { address: contractAddress, abi: flashDropAbi, functionName: "startTime" },
            { address: contractAddress, abi: flashDropAbi, functionName: "duration" },
            { address: contractAddress, abi: flashDropAbi, functionName: "sold" },
            { address: contractAddress, abi: flashDropAbi, functionName: "cancelled" },
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
          setSeller(null);
          setSale(null);
          setCancelled(false);
        }
        scheduleNext(3000);
        return;
      }
      consecutiveFailures = 0;

      const [
        sellerAddress,
        itemName,
        itemDescription,
        startPrice,
        endPrice,
        startTime,
        duration,
        isSold,
        isCancelled,
        currentBuyer,
        price,
      ] = results;
      setReadError(null);
      setSeller(sellerAddress);
      setSale({ itemName, itemDescription, startPrice, endPrice, startTime, duration });
      setSold(isSold);
      setCancelled(isCancelled);
      setBuyer(isSold ? currentBuyer : null);
      setSoldPrice(isSold ? price : null);
      // A new sale was just armed (startNewSale flips this true->false). Reset this wallet's own
      // buy status so its button reads "Buy now" for the new item instead of a stale "Purchased!"
      // left over from buying a previous item in the same connected session.
      if (prevSoldRef.current === true && isSold === false) {
        setStatus("idle");
        setError(null);
      }
      prevSoldRef.current = isSold;
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
    if (sold || cancelled) return;
    const id = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(id);
  }, [sold, cancelled]);

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

  // Forgets the connected wallet on this page only — there's no way for a dApp to revoke a
  // wallet extension's own connection permission (that's controlled entirely by the wallet, e.g.
  // MetaMask's "Connected sites"), so this just drops the local session and returns the UI to
  // "Connect wallet". Also clears admin state, since starting/cancelling a sale needs a connected
  // wallet just like buying does.
  const disconnect = useCallback(() => {
    walletClientRef.current = null;
    setAccount(null);
    setStatus("idle");
    setError(null);
    setAdminStatus("idle");
    setAdminError(null);
    setAdminAction(null);
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

  // Seller-only: arms the next item on this same contract instance once the current sale has sold
  // or been cancelled (see cancelSale below). Unlike buy(), this is a plain write — no Permit2
  // signature involved, since it doesn't move any funds. The contract itself enforces
  // `msg.sender == seller` and `sold || cancelled` (see FlashDrop.sol), so this call will revert
  // if none of that holds; this UI is only ever shown to the connected seller as a convenience,
  // not as the actual access control.
  const adminStartNewSale = useCallback(
    async (input: NewSaleInput) => {
      const wallet = walletClientRef.current;
      if (!wallet || !account) return;
      setAdminError(null);
      setAdminStatus("starting");
      try {
        const hash = await wallet.writeContract({
          account,
          address: contractAddress,
          abi: flashDropAbi,
          functionName: "startNewSale",
          args: [input.itemName, input.itemDescription, input.startPrice, input.endPrice, input.durationSeconds],
          chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        setAdminAction("start");
        setAdminStatus("done");
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : String(err));
        setAdminStatus("error");
      }
    },
    [account, publicClient, contractAddress, chain],
  );

  // Seller-only: pulls the current sale before anyone has bought it (e.g. wrong price, wrong
  // item), so a new one can be armed via adminStartNewSale above instead of waiting for a sale
  // nobody wants. The contract enforces `msg.sender == seller` and `!sold` (see cancelSale in
  // FlashDrop.sol); same convenience-only UI gating as adminStartNewSale.
  const adminCancelSale = useCallback(async () => {
    const wallet = walletClientRef.current;
    if (!wallet || !account) return;
    setAdminError(null);
    setAdminStatus("cancelling");
    try {
      const hash = await wallet.writeContract({
        account,
        address: contractAddress,
        abi: flashDropAbi,
        functionName: "cancelSale",
        args: [],
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setAdminAction("cancel");
      setAdminStatus("done");
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
      setAdminStatus("error");
    }
  }, [account, publicClient, contractAddress, chain]);

  return {
    account,
    connect,
    disconnect,
    seller,
    adminStartNewSale,
    adminCancelSale,
    adminStatus,
    adminError,
    adminAction,
    sale,
    displayedPrice,
    auctionEnded,
    sold,
    cancelled,
    buyer,
    soldPrice,
    status,
    error,
    buyNow,
    readError,
  };
}
