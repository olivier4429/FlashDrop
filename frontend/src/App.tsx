import { formatUnits, isAddress, type Address } from "viem";
import { useFlashDrop } from "./lib/useFlashDrop";
import "./App.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_FLASHDROP_ADDRESS as string | undefined;
const PRODUCT_NAME = import.meta.env.VITE_PRODUCT_NAME || "Mystery Drop #1";
const PRODUCT_DESCRIPTION =
  import.meta.env.VITE_PRODUCT_DESCRIPTION || "A one-of-a-kind digital item. First confirmed buyer wins it.";

function formatUsdc(amount: bigint): string {
  return Number(formatUnits(amount, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function AuctionView({ contractAddress }: { contractAddress: Address }) {
  const { account, connect, sale, displayedPrice, auctionEnded, sold, buyer, soldPrice, status, error, buyNow } =
    useFlashDrop(contractAddress);

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
    <div className="drop-card">
      <p className="eyebrow">Arc Flash Drop</p>
      <h1>{PRODUCT_NAME}</h1>
      <p className="description">{PRODUCT_DESCRIPTION}</p>

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
    </div>
  );
}

function App() {
  if (!CONTRACT_ADDRESS || !isAddress(CONTRACT_ADDRESS)) {
    return (
      <div className="drop-card">
        <p className="eyebrow">Arc Flash Drop</p>
        <h1>Not configured</h1>
        <p className="description">
          Set <code>VITE_FLASHDROP_ADDRESS</code> to a deployed FlashDrop contract address (see
          <code>.env.example</code>) and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <main className="page">
      <AuctionView contractAddress={CONTRACT_ADDRESS} />
    </main>
  );
}

export default App;
