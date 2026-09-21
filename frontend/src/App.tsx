import { useState, type FormEvent } from "react";
import { formatUnits, isAddress, parseUnits, type Address, type Chain } from "viem";
import { DEFAULT_NETWORK_INDEX, NETWORKS } from "./lib/arcChain";
import { useFlashDrop } from "./lib/useFlashDrop";
import { useSaleHistory } from "./lib/useSaleHistory";
import "./App.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_FLASHDROP_ADDRESS as string | undefined;
// Fallback copy shown only before the first successful on-chain read — the actual item name and
// description are read from the contract itself (see useFlashDrop.ts), not from build-time config,
// so they always match whatever item the seller most recently started via startNewSale.
const FALLBACK_PRODUCT_NAME = "Flash Drop";
const FALLBACK_PRODUCT_DESCRIPTION = "Loading the current item…";

function formatUsdc(amount: bigint): string {
  return Number(formatUnits(amount, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTimestamp(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Sidebar list of past sales, reconstructed from event logs (see useSaleHistory.ts) since the
// contract only ever stores the current sale — there's no on-chain "history" to just read.
function HistoryPanel({ contractAddress, chain }: { contractAddress: Address; chain: Chain }) {
  const { history, loading } = useSaleHistory(contractAddress, chain);

  return (
    <aside className="history-panel">
      <p className="eyebrow">Past sales</p>
      {history === null && loading && <p className="history-empty">Loading…</p>}
      {history !== null && history.length === 0 && <p className="history-empty">No past sales yet.</p>}
      {history && history.length > 0 && (
        <ul className="history-list">
          {history.map((sale) => (
            <li key={`${sale.blockNumber}-${sale.buyer}`} className="history-item">
              <p className="history-item-name">{sale.itemName}</p>
              <p className="history-item-meta">
                ${formatUsdc(sale.price)} · {shortAddress(sale.buyer)}
              </p>
              <p className="history-item-time">{formatTimestamp(sale.timestamp)}</p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// Seller-only: arms the next item on this same contract instance. Only ever rendered when the
// connected wallet matches seller() (see AuctionView below) — that check is a UI convenience, not
// the real access control, which is enforced on-chain by startNewSale's `msg.sender == seller`
// require (see FlashDrop.sol). Anyone forging this form client-side would just get a revert.
function AdminPanel({
  sold,
  onStartNewSale,
  adminStatus,
  adminError,
}: {
  sold: boolean;
  onStartNewSale: (input: { itemName: string; itemDescription: string; startPrice: bigint; endPrice: bigint; durationSeconds: bigint }) => void;
  adminStatus: "idle" | "starting" | "done" | "error";
  adminError: string | null;
}) {
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [endPrice, setEndPrice] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");

  const parsedStart = Number(startPrice);
  const parsedEnd = Number(endPrice);
  const parsedDuration = Number(durationSeconds);
  const formValid =
    itemName.trim() !== "" &&
    Number.isFinite(parsedStart) &&
    Number.isFinite(parsedEnd) &&
    parsedStart > parsedEnd &&
    parsedEnd >= 0 &&
    Number.isInteger(parsedDuration) &&
    parsedDuration > 0;

  const submitting = adminStatus === "starting";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formValid || !sold || submitting) return;
    onStartNewSale({
      itemName: itemName.trim(),
      itemDescription: itemDescription.trim(),
      // USDC on Arc uses 6 decimals at the ERC-20 interface FlashDrop reads (see FlashDrop.sol's
      // USDC comment) — parseUnits(_, 6) converts the dollar amount typed here into that integer.
      startPrice: parseUnits(startPrice, 6),
      endPrice: parseUnits(endPrice, 6),
      durationSeconds: BigInt(parsedDuration),
    });
  };

  return (
    <details className="admin-panel">
      <summary>Seller admin</summary>
      <form className="admin-form" onSubmit={handleSubmit}>
        {!sold && (
          <p className="admin-hint">
            The current sale is still active — startNewSale can only run once it's sold.
          </p>
        )}
        <label>
          Item name
          <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Vintage Leather Jacket" />
        </label>
        <label>
          Item description
          <textarea
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder="Size M, one owner, no visible wear."
            rows={2}
          />
        </label>
        <div className="admin-form-row">
          <label>
            Start price (USD)
            <input type="number" min="0" step="0.01" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} placeholder="100" />
          </label>
          <label>
            End price (USD)
            <input type="number" min="0" step="0.01" value={endPrice} onChange={(e) => setEndPrice(e.target.value)} placeholder="10" />
          </label>
        </div>
        <label>
          Duration (seconds)
          <input type="number" min="1" step="1" value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} placeholder="300" />
        </label>
        <button className="admin-submit" type="submit" disabled={!formValid || !sold || submitting}>
          {submitting ? "Starting sale…" : "Start new sale"}
        </button>
        {adminStatus === "done" && <p className="admin-success">New sale started.</p>}
        {adminError && <p className="error-message">{adminError}</p>}
      </form>
    </details>
  );
}

function AuctionView({ contractAddress, chain }: { contractAddress: Address; chain: (typeof NETWORKS)[number]["chain"] }) {
  const {
    account,
    connect,
    seller,
    adminStartNewSale,
    adminStatus,
    adminError,
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
  } = useFlashDrop(contractAddress, chain);

  if (readError) {
    return (
      <>
        <h1>{FALLBACK_PRODUCT_NAME}</h1>
        <p className="description">{readError} Check that this network matches where you deployed it.</p>
      </>
    );
  }

  const progress =
    sale && displayedPrice !== null && sale.startPrice !== sale.endPrice
      ? Number(sale.startPrice - displayedPrice) / Number(sale.startPrice - sale.endPrice)
      : 0;

  const busy = status === "connecting" || status === "checking-allowance" || status === "approving" || status === "signing" || status === "buying";

  const buyLabel: Record<string, string> = {
    idle: "Buy now",
    connecting: "Connecting…",
    "checking-allowance": "Checking wallet…",
    approving: "Approving USDC (one-time)…",
    signing: "Sign in your wallet…",
    buying: "Confirming purchase…",
    done: "Purchased!",
    error: "Try again",
  };

  return (
    <>
      <h1>{sale?.itemName || FALLBACK_PRODUCT_NAME}</h1>
      <p className="description">{sale?.itemDescription || FALLBACK_PRODUCT_DESCRIPTION}</p>

      {sold ? (
        <div className="sold-panel">
          <p className="sold-banner">SOLD</p>
          {soldPrice !== null && <p className="sold-price">${formatUsdc(soldPrice)}</p>}
          {buyer && <p className="sold-buyer">Won by {shortAddress(buyer)}</p>}
          <p className="finality-note">
            Finalized deterministically in under a second — no reorg can change this outcome.
          </p>
        </div>
      ) : (
        <>
          <div className="price-display">
            <span className="currency">$</span>
            <span className="price">{displayedPrice !== null ? formatUsdc(displayedPrice) : "—"}</span>
          </div>

          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
          </div>

          {sale && (
            <div className="price-range">
              <span>${formatUsdc(sale.startPrice)}</span>
              <span>${formatUsdc(sale.endPrice)}</span>
            </div>
          )}

          {auctionEnded && <p className="ended-note">Price has reached its floor — still available at this price.</p>}

          {account ? (
            <button className="buy-button" disabled={busy} onClick={buyNow}>
              {buyLabel[status]}
            </button>
          ) : (
            <button className="buy-button" disabled={status === "connecting"} onClick={connect}>
              {status === "connecting" ? "Connecting…" : "Connect wallet"}
            </button>
          )}

          {error && <p className="error-message">{error}</p>}

          <p className="pitch-note">
            No public mempool on Arc means no one can see or front-run your purchase before it
            finalizes.
          </p>
        </>
      )}

      {account && seller && account.toLowerCase() === seller.toLowerCase() && (
        <AdminPanel sold={sold} onStartNewSale={adminStartNewSale} adminStatus={adminStatus} adminError={adminError} />
      )}
    </>
  );
}

function App() {
  const [networkIndex, setNetworkIndex] = useState(DEFAULT_NETWORK_INDEX);
  const network = NETWORKS[networkIndex];

  const networkPicker = (
    <select
      className="network-select"
      value={networkIndex}
      onChange={(e) => setNetworkIndex(Number(e.target.value))}
    >
      {NETWORKS.map((n, i) => (
        <option key={n.chain.id} value={i}>
          {n.label}
        </option>
      ))}
    </select>
  );

  const contractConfigured = CONTRACT_ADDRESS && isAddress(CONTRACT_ADDRESS);

  return (
    <main className="page">
      <div className="layout">
        <div className="drop-card">
          <div className="card-header">
            <p className="eyebrow">Arc Flash Drop</p>
            {networkPicker}
          </div>
          {!contractConfigured ? (
            <>
              <h1>{FALLBACK_PRODUCT_NAME}</h1>
              <p className="description">
                Set <code>VITE_FLASHDROP_ADDRESS</code> in <code>frontend/.env.local</code> (see{" "}
                <code>.env.example</code>) to a deployed FlashDrop contract address and restart the dev
                server.
              </p>
            </>
          ) : (
            <AuctionView contractAddress={CONTRACT_ADDRESS as Address} chain={network.chain} />
          )}
        </div>
        {contractConfigured && <HistoryPanel contractAddress={CONTRACT_ADDRESS as Address} chain={network.chain} />}
      </div>
    </main>
  );
}

export default App;
