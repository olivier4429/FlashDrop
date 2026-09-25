# Arc Flash Drop

A single-product reverse Dutch auction on [Arc](https://arc.io) mainnet: the price of one item
drops in real time from a start price to a floor price, and the first buyer to confirm at the
price shown at that instant wins it. Built as a proof of concept for the Arc Microgrants program.

## The idea

A continuously falling price has a specific weakness on chains with a public mempool: the moment
a buyer decides the price is right and submits a purchase, that transaction is visible to everyone
before it's confirmed. A bot can copy it with a higher priority fee, get included first, and take
the item at the price the buyer had chosen. That's front-running, a well-documented form of MEV on
NFT mints and other time-sensitive on-chain sales. On Ethereum it can be mitigated with private
RPCs like Flashbots Protect, but that's opt-in tooling most buyers never use.

FlashDrop is one contract with one product live at a time, reusable for the next item once the
current one is sold or cancelled:

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
  a front-running bot to see and copy before a `buy()` transaction finalizes — the attack class
  doesn't apply here, not because it was mitigated, but because the data it depends on isn't
  exposed. (This removes third-party front-running; transaction ordering within a block is still
  up to Arc's validators.)
- **Deterministic, sub-second finality.** Once a `buy()` transaction is included, there is zero
  ambiguity about who bought first at what price, and no reorg risk that could change the winner
  after the fact.

Worth being precise about what this pitch is *not*: it isn't "the transaction is irreversible" —
every chain has that property once a transaction is confirmed, Arc included. What's actually
unique here is *how fast and how deterministically* that irreversibility is reached, combined with
having no pre-finality visibility into pending purchases at all.

On top of that, FlashDrop uses **Permit2** (already deployed on Arc at the same address on mainnet
and testnet) so a purchase is a single on-chain transaction: the buyer signs an off-chain EIP-712
message authorizing "up to X USDC" for this contract, and `buy()` pulls the current price in one
transaction. The only on-chain approval is a one-time USDC → Permit2 approval, reused across every
FlashDrop instance and every other Permit2-based app. Without it, each new contract would need its
own `approve()` transaction before a first purchase — an extra transaction at exactly the moment
the buyer is racing anyone else watching the same drop.

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
npm test          # runs the Solidity test suite (30 tests, including a fuzz test)
```

The tests run against the **real Permit2 bytecode deployed on Arc**, not a mock:
`script/vendor/Permit2.deployedBytecode.txt` was copied from Arc mainnet with `eth_getCode`, and
it matches the canonical Uniswap Permit2 on Ethereum byte for byte, apart from its two
deployment-time immutables (the cached chain ID and domain separator). Only USDC is mocked.

## Deploying

Copy `contracts/.env.example` to `contracts/.env` and fill in `PRIVATE_KEY` (the seller wallet)
and the RPC URL for the network you're targeting.

```
cd contracts
ITEM_NAME="Vintage Leather Jacket" ITEM_DESCRIPTION="Size M, one owner, no visible wear." \
  START_PRICE=100000000 END_PRICE=10000000 DURATION_SECONDS=300 \
  npx hardhat run --build-profile production script/deploy.ts --network arcTestnet
```

Always pass `--build-profile production` for a real network (or use `npm run deploy:testnet` /
`npm run deploy:mainnet`, which do): without it, `hardhat run` compiles with the `default`
profile, which has the optimizer off. Prices must fit in a `uint64` and the duration in a
`uint32` (the contract's parameter types).

Prices are USDC amounts in 6-decimal units (`100000000` = 100 USDC). Use `--network arcMainnet`
for a real deploy (needs a wallet funded with real USDC — there is no mainnet faucet), or
`--network hardhatMainnet` for a quick local dry run with no persistent state.

Note the deployed contract address printed at the end — you'll need it for the frontend.

### Reusing the contract for a new item

Deploy once per contract instance, not once per item. Once the current sale has sold (or been
cancelled by the seller via `cancelSale()`), the original seller can arm the same contract for the
next item:

```
FLASHDROP_ADDRESS=0x... ITEM_NAME="..." ITEM_DESCRIPTION="..." \
  START_PRICE=... END_PRICE=... DURATION_SECONDS=... \
  npx hardhat run --build-profile production script/startNewSale.ts --network arcTestnet
```

`itemName`/`itemDescription` are stored on-chain (not just in frontend config) precisely because
the same contract gets reused across items this way — the frontend always shows whatever item is
currently live, with no risk of a stale title left over from before this call.

This reverts if called by anyone other than the seller, or if the current sale is still active (neither sold nor cancelled).

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
addresses, so a setup script places them there first (a mock USDC, plus the real Permit2 and
Multicall3 bytecode):

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

## Security note for buyers: the one-time Permit2 approval

The first purchase from a wallet sends `approve(Permit2, unlimited)` on USDC. This is what makes
every later purchase, on this drop or any future one, a single signature plus one transaction,
with no new approval each time. The trade-off: any site that gets you to sign a malicious Permit2
message could use that approval to move your USDC. The app warns about this before your first
Buy click. In practice:

- Only sign Permit2 requests on sites you trust. Check what the wallet shows: FlashDrop's
  signatures always name USDC, an amount close to the displayed price, this contract as
  `spender`, and a deadline two minutes away.
- You can revoke the approval at any time (e.g. on [revoke.cash](https://revoke.cash)). The next
  purchase will just ask for it again.

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
