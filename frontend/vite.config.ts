import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { createPublicClient, http, isAddress } from 'viem'
import { defineConfig, loadEnv } from 'vite'

// Chain IDs from docs/arc-notes/01-fondamentaux-reseau.md (same values as src/lib/arcChain.ts).
const ARC_MAINNET = { id: 5042, rpcEnv: 'VITE_ARC_MAINNET_RPC_URL', defaultRpc: 'https://rpc.mainnet.arc.io' }
const ARC_TESTNET = { id: 5042002, rpcEnv: 'VITE_ARC_TESTNET_RPC_URL', defaultRpc: 'https://rpc.testnet.arc.io' }

// Which network each Vercel environment must target: production is the Arc mainnet deliverable,
// preview deployments (branches / PRs) run against testnet so they can be tried without real USDC.
const NETWORK_BY_VERCEL_ENV: Record<string, typeof ARC_MAINNET> = {
  production: ARC_MAINNET,
  preview: ARC_TESTNET,
}

type VercelHeader = { key: string; value: string }
type VercelConfig = { headers: { source: string; headers: VercelHeader[] }[] }
const vercelConfig = JSON.parse(fs.readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as VercelConfig
const siteHeaders = vercelConfig.headers.find((h) => h.source === '/(.*)')?.headers ?? []
const csp = siteHeaders.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
const cspConnectSrc = csp.split(';').map((d) => d.trim().split(/\s+/)).find(([name]) => name === 'connect-src')?.slice(1) ?? []

// Runs only for builds on Vercel (VERCEL=1 is set there). It turns the usual deployment mistakes
// into a failed build instead of a live site that can't read its contract:
//   - a missing/malformed VITE_FLASHDROP_ADDRESS (the app would show a setup message to visitors);
//   - VITE_CHAIN_ID not matching the environment (e.g. a preview accidentally on mainnet);
//   - an RPC URL override the Content-Security-Policy in vercel.json would block;
//   - an address with no FlashDrop contract on the selected network.
async function checkVercelEnv(env: Record<string, string>) {
  const vercelEnv = process.env.VERCEL_ENV ?? 'preview'
  const expected = NETWORK_BY_VERCEL_ENV[vercelEnv]
  const errors: string[] = []

  const address = env.VITE_FLASHDROP_ADDRESS
  if (!address || !isAddress(address)) errors.push(`VITE_FLASHDROP_ADDRESS must be a contract address, got "${address ?? ''}".`)
  if (expected && env.VITE_CHAIN_ID !== String(expected.id)) {
    errors.push(`VITE_CHAIN_ID must be ${expected.id} for the "${vercelEnv}" environment, got "${env.VITE_CHAIN_ID ?? ''}".`)
  }
  for (const network of [ARC_MAINNET, ARC_TESTNET]) {
    const override = env[network.rpcEnv]
    if (override && !cspConnectSrc.includes(new URL(override).origin)) {
      errors.push(`${network.rpcEnv}=${override} is not allowed by connect-src in vercel.json's Content-Security-Policy; add its origin there too.`)
    }
  }
  if (errors.length > 0) throw new Error(`Vercel build refused:\n  - ${errors.join('\n  - ')}`)

  // Reads through the same RPC the deployed site will use. Unreachable RPC = warning only, so an
  // RPC hiccup can't block a deploy; a reachable RPC with no FlashDrop at the address = failure.
  const network = expected ?? [ARC_MAINNET, ARC_TESTNET].find((n) => String(n.id) === env.VITE_CHAIN_ID)
  if (!network) return
  const rpcUrl = env[network.rpcEnv] || network.defaultRpc
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) })
  let chainId: number
  let code: string | undefined
  try {
    chainId = await client.getChainId()
    code = await client.getCode({ address: address as `0x${string}` })
  } catch (err) {
    console.warn(`[vercel env check] could not reach ${rpcUrl} to verify the contract, skipping: ${String(err)}`)
    return
  }
  if (chainId !== network.id) throw new Error(`Vercel build refused: ${rpcUrl} reports chain ${chainId}, expected ${network.id}.`)
  if (!code || code === '0x') throw new Error(`Vercel build refused: no contract at ${address} on chain ${network.id} (${rpcUrl}).`)
  const saleId = await client.readContract({
    address: address as `0x${string}`,
    abi: [{ type: 'function', name: 'saleId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] }],
    functionName: 'saleId',
  }).catch(() => null)
  if (saleId === null) throw new Error(`Vercel build refused: ${address} on chain ${network.id} is not a current FlashDrop (no saleId()).`)
  console.log(`[vercel env check] ${vercelEnv}: FlashDrop ${address} on chain ${network.id}, current saleId ${saleId}.`)
}

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  if (command === 'build' && process.env.VERCEL) await checkVercelEnv(loadEnv(mode, process.cwd(), 'VITE_'))

  return {
    plugins: [react()],
    // `npm run preview` serves the production build with the same security headers as Vercel
    // (read from vercel.json, so there's one source of truth), to catch a CSP violation locally
    // before it reaches the live site. HSTS and upgrade-insecure-requests are left out: they only
    // make sense over HTTPS, and the local preview server is plain HTTP.
    preview: {
      headers: Object.fromEntries(
        siteHeaders
          .filter((h) => h.key !== 'Strict-Transport-Security')
          .map((h) => [h.key, h.value.replace(/;\s*upgrade-insecure-requests/, '')]),
      ),
    },
  }
})
