# Arc Flash Drop : frontend

React + Vite + viem. Local development and the contract side are covered in the root
[`README.md`](../README.md); this file is about shipping the frontend to **Vercel**.

## How the Vercel deployment is set up

| Vercel environment | Triggered by | Network | Contract |
|---|---|---|---|
| **Production** | every push to `main` | Arc **mainnet** (`5042`) | the mainnet FlashDrop |
| **Preview** | every other branch / pull request | Arc **testnet** (`5042002`) | a testnet FlashDrop |

The public site is pinned to its environment's network. The network dropdown is hidden in
production builds (`NETWORK_LOCKED` in `src/lib/arcChain.ts`), since each deployment has exactly
one contract address. The dropdown stays available under `npm run dev`.

Everything Vercel needs is in [`vercel.json`](vercel.json) (build settings, security headers,
ignored build step) and `package.json` (`engines.node: 22.x`). Nothing has to be set in the
dashboard except the items below.

## One-time setup in the Vercel dashboard

1. **Add New… → Project → Import** the `olivier4429/FlashDrop` GitHub repository.
2. **Root Directory: `frontend`**. This is the only setting to change on the import screen. The
   framework (Vite), install/build commands and output directory come from `vercel.json`.
3. **Environment Variables**, set per environment. Each variable can be scoped to Production and/or
   Preview in the same form:

   | Variable | Production | Preview |
   |---|---|---|
   | `VITE_FLASHDROP_ADDRESS` | mainnet FlashDrop address | testnet FlashDrop address |
   | `VITE_CHAIN_ID` | `5042` | `5042002` |
   | `VITE_PERMIT_SAFETY_MARGIN_SECONDS` | optional (default `10`) | optional |
   | `VITE_ARC_MAINNET_RPC_URL` / `VITE_ARC_TESTNET_RPC_URL` | optional, see below | optional |

   None of these are secrets: `VITE_*` variables are inlined into the JavaScript bundle at build
   time and are readable by any visitor. **Never put a private key or a paid RPC API key here.**
   Because they are inlined at build time, changing one only takes effect after a **redeploy**
   (Deployments → ⋯ → Redeploy).
4. Deploy. After that, deploys are automatic on push.

Optional: **Settings → Domains** to add a custom domain. **Settings → Deployment Protection** keeps
preview URLs behind Vercel login by default, which is fine for internal testing. Share the
production URL publicly.

## Order of operations for the first mainnet launch

1. Deploy the contract on mainnet from `contracts/`: `npm run deploy:mainnet` (uses the
   optimized `production` build profile). Before that, see the open pre-mainnet items: private key
   in Hardhat's keystore rather than `.env`, and pre-deploy checks.
2. Deploy one on testnet the same way (`npm run deploy:testnet`) for the previews.
3. Put both addresses in the Vercel environment variables above, then deploy/redeploy.

## Build-time safety checks (Vercel only)

`vite.config.ts` runs extra checks when it builds on Vercel (`VERCEL=1`). If any of them fails, the
build fails and the previous deployment stays live, rather than a broken site shipping:

- `VITE_FLASHDROP_ADDRESS` is a well-formed address;
- `VITE_CHAIN_ID` matches the environment (`5042` in production, `5042002` in previews), so a
  preview can never point at mainnet and production can never point at testnet;
- any RPC URL override is allowed by the Content-Security-Policy's `connect-src` (otherwise the
  browser would silently block every read);
- the address actually holds a FlashDrop contract **of the current version** on that network. The
  check calls `saleId()`, so an instance deployed before that function was added is refused and
  needs redeploying. If the RPC is unreachable at build time, this last check only warns.

You can rehearse them locally, e.g.:

```
VERCEL=1 VERCEL_ENV=preview VITE_CHAIN_ID=5042002 VITE_FLASHDROP_ADDRESS=0x... npm run build
```

## Security headers

Set in `vercel.json` for every response:

- **Content-Security-Policy**: scripts, styles, images and fonts only from the site itself; network
  requests only to the site and Arc's two public RPCs; no plugins; no framing. Wallet extensions are
  unaffected: they talk to the page through `window.ethereum`, not network requests.
- **`frame-ancestors 'none'` + `X-Frame-Options: DENY`**: the page can't be embedded in an iframe.
  This matters for a page with a Buy button, since framing is how clickjacking tricks a user into
  clicking it.
- `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`,
  and HSTS.
- `/assets/*` (content-hashed file names) is cached for a year as immutable.

**If you point the app at another RPC** (e.g. a dedicated provider instead of the public
`rpc.*.arc.io`), add its origin to `connect-src` in `vercel.json` as well; the build check above
reminds you if you forget. Keep in mind that the RPC URL is public (it ships in the bundle).

To test the headers locally, `npm run build && npm run preview` serves the production build with the
same headers (read from `vercel.json`; HSTS and `upgrade-insecure-requests` are dropped there since
the preview server is plain HTTP). Open the DevTools console and check for CSP violations.

## Ignored build step

`vercel.json`'s `ignoreCommand` skips a deployment when nothing under `frontend/` changed since the
last successful deployment of that branch. That covers commits that only touch `contracts/` or the
docs. If Vercel has no previous deployment to compare against, it always builds.
