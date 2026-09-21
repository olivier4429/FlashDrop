# Arc Flash Drop

A single-product reverse Dutch auction on [Arc](https://arc.io) mainnet: the price of one item
drops in real time from a start price to a floor price, and the first buyer to confirm at the
price shown at that instant wins it. Built as a proof of concept for the Arc Microgrants program.

## The idea

Most "flash drop" mechanics fall back on a fixed price plus a countdown timer, because a
continuously falling price is genuinely dangerous to run on a normal blockchain: whoever is
watching the mempool can see a buyer's transaction before it's confirmed, copy it with higher gas,
and steal the deal at the price the original buyer was aiming for. That's called sniping, and it's
a real, documented problem on time-sensitive drops (sneaker releases, NFT mints) on chains with a
visible mempool.

FlashDrop is one contract, one product:

- The seller deploys it with a `startPrice`, an `endPrice`, and a `duration`.
- `currentPrice()` decays linearly between the two over that duration.
- `buy()` charges whoever calls it first the price shown at that exact moment, and closes the sale.
- Once sold, the seller can arm the *same* contract for the next item with `startNewSale(...)`
  instead of deploying a new one — see [Reusing the contract](#reusing-the-contract-for-a-new-item).

## Why Arc, specifically

Two protocol-level properties of Arc make the continuously-falling-price mechanic actually safe,
not just theoretically neat:

- **No public mempool.** Arc disables pending-transaction visibility at the RPC level
  (`eth_subscribe("newPendingTransactions")` is not available). There is structurally nothing for
  a sniping bot to see and copy before a `buy()` transaction finalizes — the attack class doesn't
  apply here, not because it was mitigated, but because the data it depends on isn't exposed.
- **Deterministic, sub-second finality.** Once a `buy()` transaction is included, there is zero
  ambiguity about who bought first at what price, and no reorg risk that could change the winner
  after the fact.

Worth being precise about what this pitch is *not*: it isn't "the transaction is irreversible" —
every chain has that property once a transaction is confirmed, Arc included. What's actually
unique here is *how fast and how deterministically* that irreversibility is reached, combined with
having no pre-finality visibility into pending purchases at all.

On top of that, FlashDrop uses **Permit2** (already deployed on Arc at the same address on mainnet
and testnet) so a purchase is a single wallet interaction: the buyer signs an off-chain EIP-712
message authorizing the transfer, and `buy()` pulls the current price in one on-chain transaction.
Without it, buying would take two transactions — an `approve()` and then the purchase — with the
price dropping between them, which defeats the point of a live decreasing price.

More background on Arc itself (network fundamentals, the USDC-as-gas model, Permit2, the build
tooling) lives in `docs/arc-notes/`, and the fuller project history — ideas considered and dropped,
open decisions, verified addresses — lives in `PROJECT_BRIEF.md`.

## Project layout

```
contracts/   Solidity contract (Hardhat) — FlashDrop.sol, tests, deploy/admin scripts
frontend/    React + Vite + viem app — live price countdown and the buy flow
docs/        Background research notes on Arc
```

## Prerequisites

- Node.js 20+ and npm
- A wallet (e.g. MetaMask) if you're testing the buy flow against Arc testnet or mainnet
- Testnet USDC from `faucet.circle.com` (select "Arc Testnet") if deploying/testing on testnet

## Contract: install, compile, test

```
cd contracts
npm install
npm run compile
npm test          # runs the Solidity test suite (12 tests)
```

## Deploying

Copy `contracts/.env.example` to `contracts/.env` and fill in `PRIVATE_KEY` (the seller wallet)
and the RPC URL for the network you're targeting.

```
cd contracts
ITEM_NAME="Vintage Leather Jacket" ITEM_DESCRIPTION="Size M, one owner, no visible wear." \
  START_PRICE=100000000 END_PRICE=10000000 DURATION_SECONDS=300 \
  npx hardhat run script/deploy.ts --network arcTestnet
```

Prices are USDC amounts in 6-decimal units (`100000000` = 100 USDC). Use `--network arcMainnet`
for a real deploy (needs a wallet funded with real USDC — there is no mainnet faucet), or
`--network hardhatMainnet` for a quick local dry run with no persistent state.

Note the deployed contract address printed at the end — you'll need it for the frontend.

### Reusing the contract for a new item

Deploy once per contract instance, not once per item. Once the current sale has sold, the
original seller can arm the same contract for the next item:

```
FLASHDROP_ADDRESS=0x... ITEM_NAME="..." ITEM_DESCRIPTION="..." \
  START_PRICE=... END_PRICE=... DURATION_SECONDS=... \
  npx hardhat run script/startNewSale.ts --network arcTestnet
```

`itemName`/`itemDescription` are stored on-chain (not just in frontend config) precisely because
the same contract gets reused across items this way — the frontend always shows whatever item is
currently live, with no risk of a stale title left over from before this call.

This reverts if called by anyone other than the seller, or if the current sale hasn't sold yet.

## Frontend

```
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Fill in `frontend/.env.local`:

```
VITE_FLASHDROP_ADDRESS=0x...          # the deployed contract address
VITE_CHAIN_ID=5042002                 # which network is pre-selected: 5042002 = Testnet, 5042 = Mainnet, 31337 = local
```

The item's title and description aren't set here — the frontend reads `itemName`/`itemDescription`
live from the contract (see [Deploying](#deploying) above), so they always match whatever item the
seller currently has live.

The app has a network dropdown (top-right of the card) to switch between Arc Testnet, Arc Mainnet
and the local Hardhat node at runtime — it changes which chain the wallet/RPC talks to, using the
same `VITE_FLASHDROP_ADDRESS` regardless of which one is selected (there's only ever one active
deployment being tested at a time in this workflow; update that one value yourself if you redeploy
to a different network).

Open the app, pick a network, click **Connect wallet** and pick the account you funded with
testnet USDC — the app itself prompts your wallet to add/switch to that network automatically, no
manual wallet network setup needed. Click **Buy now**: the first purchase ever from that wallet
triggers a one-time USDC → Permit2 approval, then every purchase after that (on this drop or any
future one) is just a signature and a transaction.

## Testing locally without testnet funds

You can exercise the whole flow — including a real wallet buy — against a local node, without
needing Arc testnet USDC. The local node has no real USDC/Permit2/Multicall3 deployed at Arc's
addresses, so a setup script places working mocks there first:

```
# terminal 1
cd contracts && npx hardhat node

# terminal 2
cd contracts
npx hardhat run script/setupLocalMocks.ts --network localNode
ITEM_NAME="Vintage Leather Jacket" ITEM_DESCRIPTION="Size M, one owner, no visible wear." \
  START_PRICE=100000000 END_PRICE=10000000 DURATION_SECONDS=300 \
  npx hardhat run script/deploy.ts --network localNode
```

Then set `VITE_FLASHDROP_ADDRESS` in `frontend/.env.local` to the deployed address, pick
"Local (Hardhat node)" from the app's network dropdown, add a `http://127.0.0.1:8545` / chain ID
`31337` network to your wallet, and import Hardhat's well-known test account #0 private key
(`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` — public, test-only, never
used with real funds) to act as the buyer; `setupLocalMocks.ts` mints it test USDC by default.

## Troubleshooting

**Frontend says "Could not read a FlashDrop contract at 0x... on Arc Testnet/Mainnet" even though
the address, network and `.env.local` all look correct.** Open the browser DevTools Console — if
you see `ERR_BLOCKED_BY_CLIENT` on the RPC request, that's not a network, DNS, CORS or config
issue: it means a browser-side blocker is silently dropping the request to `rpc.testnet.arc.io` /
`rpc.mainnet.arc.io` before it ever leaves the browser. Confirmed cause in practice: **Brave
Shields** (Brave's built-in ad/tracker blocker, on by default for every site) blocking the RPC
call. Fix: click the Shields icon in the address bar for this site and turn Shields down for it
(or lower "Trackers & ads blocking" from Aggressive to Standard). The same class of issue can come
from other browsers' ad-blocker/privacy extensions (uBlock Origin, Privacy Badger, an antivirus web
shield, etc.) — test in a private/incognito window with extensions disabled to confirm, then
whitelist the RPC domain instead of leaving blocking off entirely.

## Key addresses (Arc mainnet and testnet — identical on both)

| Contract | Address |
|---|---|
| USDC (ERC-20 interface; also the native gas asset, 18 decimals) | `0x3600000000000000000000000000000000000000` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
