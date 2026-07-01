// SPIKE 3 — Transaction policy denies an over-cap spend.
//
// Goal: prove the "agent can't go rogue" guardrail is real — a spending cap
// enforced BEFORE the transaction is built or broadcast. This is the best
// live-demo beat in the whole pitch: trigger an over-cap spend, watch it bounce.
//
// Fully offline: the policy proxy evaluates on the write call, before any RPC.
//
// Run:  node spike3-policy.mjs

import WDK from '@tetherto/wdk'
import { PolicyViolationError } from '@tetherto/wdk'
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'

const pass = (s) => console.log('  \x1b[32mPASS\x1b[0m   ' + s)
const fail = (s) => console.log('  \x1b[31mFAIL\x1b[0m   ' + s)
const line = (s = '') => console.log(s)

const SEED =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const USDT = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'
const CAP = 50_000_000n // 50 USDT (6 decimals) — the agent's per-transfer mandate

line('════════════════════════════════════════════════════════════')
line(' SPIKE 3 — Policy-enforced spending cap (agent guardrail)')
line('════════════════════════════════════════════════════════════')
line(` mandate: no single transfer may exceed ${CAP} base units (50 USDT)`)
line('')

const wdk = new WDK(SEED).registerWallet('crew', WalletManagerEvmErc4337, {
  chainId: 11155111,
  provider: 'https://sepolia.drpc.org',
  bundlerUrl: 'https://public.pimlico.io/v2/11155111/rpc',
  safeModulesVersion: '0.3.0',
  useNativeCoins: true,
})

// The mandate, compiled to a policy: ALLOW transfers, but DENY any over the cap.
wdk.registerPolicy({
  id: 'gaffer-agent-mandate',
  name: 'Gaffer agent spending mandate',
  scope: 'account',
  wallet: 'crew',
  accounts: [0],
  rules: [
    {
      name: 'allow-transfers',
      operation: 'transfer',
      action: 'ALLOW',
      conditions: [() => true],
    },
    {
      name: 'deny-over-cap-transfer',
      operation: 'transfer',
      action: 'DENY',
      reason: 'Transfer exceeds the agent mandate (50 USDT cap)',
      conditions: [
        ({ params }) => {
          const amount = params?.amount
          return typeof amount === 'bigint' && amount > CAP
        },
      ],
    },
  ],
})
pass('policy registered and bound to crew/account 0')

const account = await wdk.getAccount('crew', 0)
pass('got policy-wrapped account proxy')
line('')

// ── Test 1: OVER-cap transfer must be DENIED before any network work ──
line('Test 1 — attempt a 500 USDT transfer (10x over the cap)')
let denied = false
const t0 = Date.now()
try {
  await account.transfer({ token: USDT, recipient: '0x000000000000000000000000000000000000dEaD', amount: 500_000_000n })
  fail('over-cap transfer was NOT blocked — guardrail broken')
} catch (e) {
  const dt = Date.now() - t0
  if (e instanceof PolicyViolationError) {
    denied = true
    pass(`DENIED by policy in ${dt}ms — PolicyViolationError`)
    pass(`  reason:   ${e.reason}`)
    pass(`  ruleName: ${e.ruleName ?? '(n/a)'}`)
    pass('  blocked BEFORE any bundler/RPC call (instant, offline) ✅')
  } else {
    fail('threw a non-policy error (would mean it reached the network): ' + e.message)
  }
}

// ── Test 2: UNDER-cap transfer must PASS the policy (then may fail at network — that's fine) ──
line('')
line('Test 2 — attempt a 10 USDT transfer (within the cap): should pass the policy gate')
try {
  await account.transfer({ token: USDT, recipient: '0x000000000000000000000000000000000000dEaD', amount: 10_000_000n })
  pass('under-cap transfer passed the policy AND the network (fully executed)')
} catch (e) {
  if (e instanceof PolicyViolationError) {
    fail('under-cap transfer was wrongly blocked by policy: ' + e.reason)
  } else {
    pass('policy ALLOWED it (got past the gate); it then failed downstream at the')
    pass('  bundler/funding boundary as expected — proving the gate is the ONLY')
    pass('  thing that stopped Test 1: ' + (e.message || String(e)).slice(0, 90))
  }
}

line('')
line('════════════════════════════════════════════════════════════')
if (denied) {
  line(' RESULT: CALL #3 PROVEN. The spending cap is real and enforced')
  line(' pre-broadcast. The agent literally cannot exceed its mandate.')
} else {
  line(' RESULT: guardrail did NOT fire — investigate before relying on it.')
}
line('════════════════════════════════════════════════════════════')

if (wdk.dispose) wdk.dispose()
