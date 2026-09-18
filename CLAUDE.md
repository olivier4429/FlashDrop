# Arc Flash Drop

## Project overview

A single-product reverse Dutch auction ("Flash Drop") on Arc mainnet: the
price of one item decreases in real time from a start price to an end
price, and the first buyer to confirm the purchase at the current price
wins. One contract = one product; no catalog, no multi-item logic in the
MVP. Built for the Arc Microgrants program (submission deadline: October
14, 2026) — the deliverable must be a real, deployed, working proof of
concept on Arc mainnet, not a theoretical exercise.

Full project context — including the ideas we ruled out and why, the
verified contract addresses, the starter contract code, and the previous
research direction (Arc Liquidation Watchtower, kept in an appendix) —
lives in `PROJECT_BRIEF.md` at the repo root. Read it before starting any
work. Deeper background on Arc itself (network fundamentals, stablecoin/gas
model, App Kit, agentic economy standards, etc.) lives in
`docs/arc-notes/` (files 00–13). Consult the relevant note file when a task
touches a topic it covers, instead of guessing from general EVM knowledge —
Arc has several protocol-level differences from standard Ethereum that are
easy to get wrong (see "Arc-specific gotchas" below).

## Why Arc matters for this specific project (don't lose this framing)

- **No public mempool on Arc** (`eth_subscribe("newPendingTransactions")`
  is disabled at the RPC level) — this structurally prevents "sniping"
  (a bot copying a pending buy transaction with higher gas to steal the
  deal), a real and documented problem on time-based drops on chains with
  a visible mempool.
- **Deterministic sub-second finality** — once a purchase transaction is
  finalized, there's zero ambiguity about who bought first at what price,
  and no reorg risk that could change the winner after the fact.
- Note explicitly: transaction irreversibility itself is NOT unique to
  Arc (every blockchain has it once confirmed) — what's unique is
  *how fast and how deterministically* that irreversibility is reached.
  Don't reach for "it's irreversible" as the pitch; reach for "no mempool +
  sub-second deterministic finality" instead.

## How to approach a task

- **Ask before deciding on anything technically non-obvious.** If there's
  more than one reasonable way to do something (a library choice, a data
  structure, how to handle an edge case), stop and ask rather than picking
  silently. Don't ask about things that are genuinely obvious or trivial to
  reverse.
- Before writing code for a new on-chain interaction, check whether the
  address/ABI is already documented in `PROJECT_BRIEF.md`. If not, fetch it
  from `explorer.arc.io` (Blockscout API:
  `explorer.arc.io/api/v2/smart-contracts/{address}`) rather than guessing.
- Keep the MVP scope to a single *active* sale at a time — no concurrent
  multi-item catalog logic unless explicitly asked. The same contract
  instance can be reused sequentially across sales via `startNewSale`
  (decided 2026-09-18, see PROJECT_BRIEF.md), so "one contract" no longer
  means "one product for its whole lifetime" — it means one product live
  at any given moment.

## Pedagogical intent — comment Arc-specific logic thoroughly

This is a learning project, not just a deliverable. Anywhere the code
touches something specific to Arc (as opposed to generic EVM/TypeScript/
Solidity code), add a clear comment explaining *why*, not just *what* — as
if onboarding someone who knows Ethereum but not Arc. This includes,
non-exhaustively:

- Any use of `block.timestamp` — explain why it's safe here (a smooth price
  decay doesn't need strict ordering) versus the documented Arc pitfall of
  using it to order blocks/events (it's non-decreasing but not strictly
  increasing on Arc; use `block.number` for ordering instead)
- Any USDC decimals handling (native 18 vs ERC-20 6, and why both exist)
- Any reliance on Arc's lack of a public mempool or its deterministic
  finality — this is the whole reason the project needs Arc, keep that
  reasoning visible in the code, not just in docs
- Use of `Permit2` (already deployed on Arc) instead of a separate
  `approve()` transaction — explain why it matters for a live decreasing-
  price scenario
- Any contract address — comment where it came from and how it was
  verified (e.g. "confirmed via explorer.arc.io Blockscout API on <date>",
  not just pasted in silently)

Generic boilerplate (a standard viem client setup, a plain TypeScript
interface) doesn't need this treatment — reserve the extra explanation for
what's actually Arc-specific or otherwise non-obvious. Don't pad the code
with comments restating what a line obviously does.

## Language conventions

- All code, comments, commit messages, log output, and identifiers: English.
- Conversation with me in this session: French is fine, follow whatever
  language I use.

## Tech stack

- Solidity (contract), built/tested/deployed via **Hardhat** (switched from
  Arc Foundry on 2026-09-18: Arc Foundry has no native Windows binary —
  see `docs/arc-notes/04-build-deployer.md` — which would have required a
  dedicated Linux VM just for the toolchain; Hardhat is Node-based and runs
  natively on Windows, so no VM is needed). Arc Foundry's `arc-anvil` had
  the advantage of emulating Arc's protocol-specific EVM differences (see
  "Arc-specific gotchas" below); Hardhat's local network is a generic EVM
  simulator and does not model those. This is an acceptable gap for this
  contract specifically because FlashDrop never touches the behaviors that
  actually differ on Arc (no `SELFDESTRUCT`, no `PREVRANDAO` reliance, no
  native-value transfers) — it only calls `USDC.transferFrom` indirectly
  through Permit2, an ordinary ERC-20 interaction. Deployment and any final
  pre-launch dry run still happen against the real Arc mainnet RPC.
- TypeScript, Node.js for any off-chain tooling / frontend
- `viem` for on-chain reads/writes (RPC: `https://rpc.mainnet.arc.io`,
  chain ID `5042`)
- Package manager: your choice — pick whichever fits the project best
  (state your reasoning briefly if it's not npm, since that's the default
  most people expect)
- Frontend: a live, visually prominent countdown of the decreasing price
  plus a buy button — the demo's visual impact matters as much as the
  contract's correctness

## Arc-specific gotchas (don't get these wrong)

- **Gas is paid in USDC**, and USDC has two interfaces sharing the same
  underlying balance: native (18 decimals) and ERC-20 (6 decimals) at
  `0x3600000000000000000000000000000000000000`. Never mix raw values from
  the two without converting — see `docs/arc-notes/02-modele-stablecoin-gas.md`.
- **No public mempool.** Don't design anything that assumes pre-finality
  visibility into pending transactions (this is actually a *feature* we
  rely on for this project, not just a constraint to work around).
- **Deterministic finality, ~0.5s block time.** No reorgs.
- `block.timestamp` is non-decreasing but not strictly increasing on Arc
  (sub-second blocks can share a timestamp) — fine for reading elapsed wall
  time, never use it to order events/blocks (use `block.number` instead).

## Key addresses (Arc mainnet)

| Contract | Address |
|---|---|
| USDC (ERC-20 interface, also native gas) | `0x3600000000000000000000000000000000000000` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

See `PROJECT_BRIEF.md` appendix for the previously-researched Aave V4
addresses (kept in case we revisit the Liquidation Watchtower direction).

## Commands

Contract (`cd contracts`):
- `npm install` — install dependencies (first time only)
- `npm run compile` — compile contracts (`hardhat compile`)
- `npm test` — run the Solidity test suite (`hardhat test solidity`)
- Deploy a new instance (do this once per contract instance, not once per
  item — see `startNewSale` below):
  `START_PRICE=<6dp> END_PRICE=<6dp> DURATION_SECONDS=<n> npx hardhat run script/deploy.ts --network <hardhatMainnet|localNode|arcTestnet|arcMainnet>`
  (`.env` filled in from `.env.example` needed for `arcTestnet`/`arcMainnet`;
  a wallet funded with real USDC for mainnet — no faucet there; testnet
  USDC from `faucet.circle.com`, select "Arc Testnet")
- Reuse an already-deployed instance for the next item, once the current
  sale has sold (seller-only):
  `FLASHDROP_ADDRESS=<deployed> START_PRICE=<6dp> END_PRICE=<6dp> DURATION_SECONDS=<n> npx hardhat run script/startNewSale.ts --network <same network as deploy>`

Local end-to-end testing (contract + frontend together, no testnet funds needed):
- `cd contracts && npx hardhat node` — persistent local JSON-RPC node on `http://127.0.0.1:8545`
- In another shell: `cd contracts && npx hardhat run script/setupLocalMocks.ts --network localNode`
  — places mock USDC/Permit2 at Arc's real addresses on this local node and mints test USDC (see
  the script for `TEST_BUYER_ADDRESS`/`TEST_MINT_AMOUNT` overrides). Needed for the buy() flow to
  work at all locally; the passive price countdown/read side works without it.
- Then deploy as above with `--network localNode`
- In `frontend/.env.local` (gitignored): `VITE_FLASHDROP_ADDRESS_LOCAL=<deployed address>`, then
  pick "Local (Hardhat node)" from the app's network dropdown
- To test on Arc testnet instead with a real wallet (MetaMask etc.): deploy with `--network arcTestnet`,
  then set `VITE_FLASHDROP_ADDRESS_TESTNET=<deployed address>` in `frontend/.env.local` and pick
  "Arc Testnet" in the dropdown. No manual wallet network setup needed — connecting in the app
  prompts the wallet to add/switch to Arc Testnet automatically (see `ensureArcChain` in
  `useFlashDrop.ts`).

Frontend (`cd frontend`):
- `npm install` — install dependencies (first time only)
- `npm run dev` — dev server (default `http://localhost:5173`)
- `npm run build` — production build
- Needs `.env.local` (gitignored) filled in from `.env.example`. The app has a runtime network
  dropdown (Arc Testnet / Arc Mainnet / local node) — each needs its own
  `VITE_FLASHDROP_ADDRESS_{TESTNET,MAINNET,LOCAL}` since a contract deployed on one network doesn't
  exist on another; `VITE_CHAIN_ID` only picks which one is pre-selected on load (defaults to
  Testnet if unset, deliberately not Mainnet, to avoid landing on an unconfigured network — see
  `DEFAULT_NETWORK_INDEX` in `arcChain.ts`).
