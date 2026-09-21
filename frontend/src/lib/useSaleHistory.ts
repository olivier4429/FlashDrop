import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address, type Chain, createPublicClient, http } from "viem";

export interface PastSale {
  itemName: string;
  itemDescription: string;
  price: bigint;
  buyer: Address;
  timestamp: bigint;
  blockNumber: bigint;
}

// Duplicated from abi.ts's `flashDropAbi` rather than filtered out of it, so these stay plain
// `AbiEvent` literals — exactly what viem's `getLogs({ events })` expects — instead of a member of
// flashDropAbi's full function-or-event union.
const saleStartedEvent = {
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
} as const;

const soldEvent = {
  type: "event",
  name: "Sold",
  inputs: [
    { name: "buyer", type: "address", indexed: true },
    { name: "price", type: "uint256", indexed: false },
    { name: "timestamp", type: "uint256", indexed: false },
  ],
} as const;

// viem's generic `Log` type allows null block/log-index fields to account for logs from a pending
// (not-yet-mined) block — impossible here since getLogs only ever queries already-finalized block
// ranges, so it's safe to assert them non-null rather than thread `| null` through this whole file.
type SaleStartedLog = {
  eventName: "SaleStarted";
  args: { itemName: string; itemDescription: string };
  blockNumber: bigint;
  logIndex: number;
};
type SoldLog = {
  eventName: "Sold";
  args: { buyer: Address; price: bigint; timestamp: bigint };
  blockNumber: bigint;
  logIndex: number;
};
type HistoryLog = SaleStartedLog | SoldLog;

// How many completed sales to show. Kept small on purpose: this contract is reused sequentially
// across items (see startNewSale in FlashDrop.sol), and there's no on-chain storage of past
// sales at all — only the CURRENT one. The only place history exists is the event log, so
// building it means walking blocks backwards with eth_getLogs. Capping both the count and the
// block range scanned per page keeps this bounded even after months of sales, instead of
// re-scanning the entire chain from genesis on every load.
const HISTORY_LIMIT = 10;
const PAGE_SIZE_BLOCKS = 5000n; // conservative — some RPCs cap eth_getLogs to a similar range
const MAX_PAGES = 20; // stop looking back after ~100k blocks even if HISTORY_LIMIT isn't reached

// How often to re-scan for newly completed sales. Deliberately much slower than the 750ms price
// poll in useFlashDrop.ts — sales are rare events (at most one every `duration` seconds), and each
// refresh here can cost several eth_getLogs calls, unlike the single batched multicall read the
// price poll uses. This hook is self-contained (polls on its own timer) rather than being driven
// by the current sale's `sold` flag from useFlashDrop, so it doesn't need that state lifted out of
// AuctionView into a shared parent just to wire the two together.
const POLL_INTERVAL_MS = 15_000;

// Reconstructs the last few completed sales from FlashDrop's event log, since the contract itself
// only ever stores the CURRENT sale's state (see FlashDrop.sol) — nothing about past ones. Each
// `Sold` event only carries buyer/price/timestamp, not which item was sold, so this pairs it with
// whichever `SaleStarted` most recently preceded it (there's always exactly one, since a new sale
// can only start once the previous one sold) to recover the item's name/description too.
function sortLogs(logs: HistoryLog[]): HistoryLog[] {
  // Oldest-first so "current item" can be tracked forward in time as SaleStarted events update
  // it, then each Sold event records a completed sale against whatever item was live for it.
  return [...logs].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
}

export function useSaleHistory(contractAddress: Address, chain: Chain) {
  const publicClient = useMemo(() => createPublicClient({ chain, transport: http() }), [chain]);
  const [history, setHistory] = useState<PastSale[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Remembers how far the backward scan has already reached and which item was live at that
  // point, so every 15s tick after the first one only has to ask for logs newer than what's
  // already known (almost always zero or one page) instead of re-running the full paginated scan
  // from `latest` every time. Doing the expensive multi-page backward walk on every poll is what
  // was triggering RPC rate limits (HTTP 429) on Arc's public RPC — see CLAUDE.md's note on
  // needing to batch/limit request volume against it.
  const lastScannedBlockRef = useRef<bigint | null>(null);
  const currentItemRef = useRef<{ itemName: string; itemDescription: string } | null>(null);

  // Resets the "already scanned" bookkeeping whenever the contract/chain changes, so switching
  // networks or contracts triggers a fresh full backward scan instead of reusing state built for
  // a different chain.
  useEffect(() => {
    lastScannedBlockRef.current = null;
    currentItemRef.current = null;
    setHistory(null);
  }, [contractAddress, chain]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const logs: HistoryLog[] = [];

      if (lastScannedBlockRef.current === null) {
        // First run for this contract/chain: walk backward in bounded pages until HISTORY_LIMIT
        // completed sales are found (or genesis is reached). This is the only place that can cost
        // more than one eth_getLogs call, and it only happens once.
        let soldCount = 0;
        let toBlock = latestBlock;
        for (let page = 0; page < MAX_PAGES && toBlock >= 0n; page++) {
          const fromBlock = toBlock > PAGE_SIZE_BLOCKS ? toBlock - PAGE_SIZE_BLOCKS + 1n : 0n;
          const pageLogs = (await publicClient.getLogs({
            address: contractAddress,
            events: [saleStartedEvent, soldEvent],
            fromBlock,
            toBlock,
          })) as unknown as HistoryLog[];
          logs.push(...pageLogs);
          soldCount += pageLogs.filter((log) => log.eventName === "Sold").length;

          if (soldCount >= HISTORY_LIMIT || fromBlock === 0n) break;
          toBlock = fromBlock - 1n;
        }
      } else if (latestBlock > lastScannedBlockRef.current) {
        // Steady state: only ask for what's new since the last successful scan — a single call
        // covering a handful of blocks at most, the same order of magnitude as the price poll's
        // own reads.
        const pageLogs = (await publicClient.getLogs({
          address: contractAddress,
          events: [saleStartedEvent, soldEvent],
          fromBlock: lastScannedBlockRef.current + 1n,
          toBlock: latestBlock,
        })) as unknown as HistoryLog[];
        logs.push(...pageLogs);
      }

      const sortedLogs = sortLogs(logs);
      const newSales: PastSale[] = [];
      for (const log of sortedLogs) {
        if (log.eventName === "SaleStarted") {
          currentItemRef.current = { itemName: log.args.itemName, itemDescription: log.args.itemDescription };
        } else if (log.eventName === "Sold") {
          newSales.push({
            itemName: currentItemRef.current?.itemName || "(unknown item)",
            itemDescription: currentItemRef.current?.itemDescription || "",
            price: log.args.price,
            buyer: log.args.buyer,
            timestamp: log.args.timestamp,
            blockNumber: log.blockNumber,
          });
        }
      }

      lastScannedBlockRef.current = latestBlock;
      if (newSales.length > 0) {
        setHistory((prev) => [...newSales.reverse(), ...(prev ?? [])].slice(0, HISTORY_LIMIT));
      } else if (history === null) {
        // Nothing found on the very first scan — set [] (not null) so the panel can render "No
        // past sales yet." instead of staying in the loading state forever.
        setHistory([]);
      }
    } catch {
      // Best-effort only — the main sale display doesn't depend on history, so a failed scan (a
      // flaky RPC, a rate limit) just leaves whatever was already loaded rather than clearing it.
    } finally {
      setLoading(false);
    }
    // `history` is read but intentionally left out of deps — it's only consulted to tell "first
    // load, nothing found" apart from "steady state, nothing new", not to react to its own changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, contractAddress]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (document.visibilityState === "visible") {
        await refresh();
      }
      if (!cancelled) timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timeoutId);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { history, loading };
}
