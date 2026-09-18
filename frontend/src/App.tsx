import { useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { DEFAULT_NETWORK_INDEX, NETWORKS } from "./lib/arcChain";
import { useFlashDrop } from "./lib/useFlashDrop";
import "./App.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_FLASHDROP_ADDRESS as string | undefined;
const PRODUCT_NAME = import.meta.env.VITE_PRODUCT_NAME || "Free Fall";
const PRODUCT_DESCRIPTION =
  import.meta.env.VITE_PRODUCT_DESCRIPTION || "The price is in free fall. First confirmed buyer wins it.";

function formatUsdc(amount: bigint): string {
  return Number(formatUnits(amount, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function AuctionView({ contractAddress, chain }: { contractAddress: Address; chain: (typeof NETWORKS)[number]["chain"] }) {
  const { account, connect, sale, displayedPrice, auctionEnded, sold, buyer, soldPrice, status, error, buyNow, readError } =
    useFlashDrop(contractAddress, chain);

  if (readError) {
    return <p className="description">{readError} Check that this network matches where you deployed it.</p>;
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

  return (
    <main className="page">
      <div className="drop-card">
        <div className="card-header">
          <p className="eyebrow">Arc Flash Drop</p>
          {networkPicker}
        </div>
        <h1>{PRODUCT_NAME}</h1>
        <p className="description">{PRODUCT_DESCRIPTION}</p>

        {!CONTRACT_ADDRESS || !isAddress(CONTRACT_ADDRESS) ? (
          <p className="description">
            Set <code>VITE_FLASHDROP_ADDRESS</code> in <code>frontend/.env.local</code> (see{" "}
            <code>.env.example</code>) to a deployed FlashDrop contract address and restart the dev
            server.
          </p>
        ) : (
          <AuctionView contractAddress={CONTRACT_ADDRESS} chain={network.chain} />
        )}
      </div>
    </main>
  );
}

export default App;
