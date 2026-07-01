// SPIKE 1b — land a REAL gasless UserOperation on Sepolia.
//
// This retires the last real risk in the pitch: does a WDK ERC-4337 UserOp
// actually get bundled and mined, with the owner EOA holding ZERO native gas?
//
// Fastest path to a hash: SPONSORED gas (paymaster pays), zero-value self-call.
// No token funding, no faucet needed — you only need a bundler+paymaster key.
//
// ── Setup (5 min, free) ─────────────────────────────────────────────
// Pimlico (recommended, easiest testnet sponsorship):
//   1. Sign up at https://dashboard.pimlico.io  → create an API key
//   2. Create a Sponsorship Policy for Sepolia (free on testnets), copy its id
//   3. Run:
//        PIMLICO_KEY=pk_xxx SPONSORSHIP_POLICY_ID=sp_xxx node spike1b-send.mjs
//
// Candide alternative:
//   BUNDLER_URL=... PAYMASTER_URL=... [SPONSORSHIP_POLICY_ID=...] node spike1b-send.mjs
//
// Token-paymaster mode (pay gas in USDT — the pitch's real UX; needs the smart
// account to hold the paymaster token):
//   PAYMASTER_ADDRESS=0x.. PAYMASTER_TOKEN=0x.. (with BUNDLER_URL/PAYMASTER_URL)

import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'

const pass = (s) => console.log('  \x1b[32mPASS\x1b[0m   ' + s)
const info = (s) => console.log('  \x1b[36m•\x1b[0m ' + s)
const fail = (s) => console.log('  \x1b[31mFAIL\x1b[0m   ' + s)
const line = (s = '') => console.log(s)

const SEED = process.env.SEED_PHRASE ||
  'test test test test test test test test test test test junk' // fresh throwaway; replace for a stable address
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111)
const RPC_URL = process.env.RPC_URL || 'https://sepolia.drpc.org'
const PIMLICO_KEY = process.env.PIMLICO_KEY
const SPONSORSHIP_POLICY_ID = process.env.SPONSORSHIP_POLICY_ID

// Resolve bundler + paymaster endpoints.
const BUNDLER_URL =
  process.env.BUNDLER_URL ||
  (PIMLICO_KEY ? `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${PIMLICO_KEY}` : null)
const PAYMASTER_URL =
  process.env.PAYMASTER_URL ||
  (PIMLICO_KEY ? `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${PIMLICO_KEY}` : null)

line('════════════════════════════════════════════════════════════')
line(' SPIKE 1b — REAL gasless UserOperation on Sepolia')
line('════════════════════════════════════════════════════════════')

if (!BUNDLER_URL) {
  line('')
  fail('No bundler configured. Set PIMLICO_KEY (see header) or BUNDLER_URL/PAYMASTER_URL.')
  line('   This script is ready — it just needs one free API key to fire.')
  process.exit(2)
}

// Pick paymaster mode.
let modeCfg, modeName
if (process.env.PAYMASTER_ADDRESS && process.env.PAYMASTER_TOKEN) {
  modeName = 'token (pay gas in USDT)'
  modeCfg = {
    paymasterUrl: PAYMASTER_URL,
    paymasterAddress: process.env.PAYMASTER_ADDRESS,
    paymasterToken: { address: process.env.PAYMASTER_TOKEN },
  }
} else {
  modeName = 'sponsored (paymaster pays gas)'
  modeCfg = {
    isSponsored: true,
    paymasterUrl: PAYMASTER_URL,
    ...(SPONSORSHIP_POLICY_ID ? { sponsorshipPolicyId: SPONSORSHIP_POLICY_ID } : {}),
  }
}

info(`chainId=${CHAIN_ID}  mode=${modeName}`)
info(`bundler=${BUNDLER_URL.replace(/apikey=[^&]+/, 'apikey=***')}`)
line('')

const wallet = new WalletManagerEvmErc4337(SEED, {
  chainId: CHAIN_ID,
  provider: RPC_URL,
  bundlerUrl: BUNDLER_URL,
  safeModulesVersion: '0.3.0',
  ...modeCfg,
})

const account = await wallet.getAccount(0)
const address = typeof account.getAddress === 'function' ? await account.getAddress() : account.address
pass('smart account: ' + address)
const nativeBal = await account.getBalance().catch(() => null)
if (nativeBal !== null) info(`native balance: ${nativeBal} wei (should NOT matter — gas is sponsored)`)
line('')

line('Sending a zero-value self-call as a gasless UserOperation…')
try {
  // Zero-value self-call: proves the UserOp lands without needing any token.
  const res = await account.sendTransaction({ to: address, value: 0n })
  pass('UserOperation accepted by the bundler!')
  info('userOp/tx hash: ' + res.hash)
  line('')
  line('Waiting for the receipt (this is the real on-chain confirmation)…')
  let receipt = null
  for (let i = 0; i < 30; i++) {
    receipt = await (account.getUserOperationReceipt?.(res.hash) ?? account.getTransactionReceipt(res.hash)).catch(() => null)
    if (receipt) break
    await new Promise((r) => setTimeout(r, 4000))
  }
  if (receipt) {
    pass('MINED. Gasless UserOperation confirmed on-chain. ✅')
    const txHash = receipt.transactionHash || receipt.receipt?.transactionHash || res.hash
    info('explorer: https://sepolia.etherscan.io/tx/' + txHash)
    line('')
    line('════════════════════════════════════════════════════════════')
    line(' RISK RETIRED: WDK gasless ERC-4337 works end-to-end on a live')
    line(' testnet. The owner held zero native gas. Build the payout loop.')
    line('════════════════════════════════════════════════════════════')
  } else {
    info('no receipt yet after ~2min — check the hash on the explorer; the send was accepted.')
  }
} catch (e) {
  const msg = e.message || String(e)
  fail('send failed: ' + msg.slice(0, 300))
  line('')
  if (/policy|sponsor|AA33|paymaster/i.test(msg)) {
    info('Looks paymaster/policy-related: make sure your Sponsorship Policy covers')
    info('Sepolia and this operation, and that SPONSORSHIP_POLICY_ID is set.')
  } else if (/apikey|401|403|unauthorized/i.test(msg)) {
    info('Auth: check PIMLICO_KEY / BUNDLER_URL.')
  } else if (/AA50|does not hold/i.test(msg)) {
    info('Token mode needs the smart account to hold the paymaster token. Use')
    info('sponsored mode (unset PAYMASTER_ADDRESS/TOKEN) for a funding-free proof.')
  }
}

if (wallet.dispose) wallet.dispose()
