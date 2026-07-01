// Gaffer — end-to-end core loop demo (headless).
//
// The July-8 demo-critical core: crew predicts a match, the result comes in,
// the autonomous treasury agent settles the fixed prize pot to correct
// predictors as GASLESS USDT payouts — bounded by a mandate it cannot break.
//
// Run (sim — proves logic + mandate, no funds needed):
//   node gaffer-demo.mjs
// Run (live — real gasless payouts; needs PIMLICO_KEY + a funded treasury):
//   LIVE=1 PIMLICO_KEY=pim_xxx SPONSORSHIP_POLICY_ID=sp_xxx node gaffer-demo.mjs

import { Match } from './src/match.mjs'
import { GafferAgent, PolicyViolationError } from './src/agent.mjs'
import { settleMatch } from './src/settlement.mjs'

const U = 1_000_000n // 1 USDT (6 decimals)
const usdt = (n) => (Number(n) / 1e6).toFixed(2) + ' USDT'
const h = (s) => console.log('\n\x1b[1m' + s + '\x1b[0m')
const li = (s) => console.log('  ' + s)

const LIVE = process.env.LIVE === '1'
const CHAIN_ID = 11155111
const KEY = process.env.PIMLICO_KEY
const rpc = process.env.RPC_URL || 'https://sepolia.drpc.org'
const pim = KEY ? `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${KEY}` : `https://public.pimlico.io/v2/${CHAIN_ID}/rpc`
// Sepolia test token used for the pot/payouts (swap for Pimlico test ERC20 when funding for LIVE).
const TOKEN = process.env.TOKEN || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

// Crew wallets (payout recipients). Real EVM addresses; throwaway.
const CREW = {
  Tunde: '0x1111111111111111111111111111111111111111',
  Amaka: '0x2222222222222222222222222222222222222222',
  Ken: '0x3333333333333333333333333333333333333333',
  Zara: '0x4444444444444444444444444444444444444444',
}

console.log('════════════════════════════════════════════════════════════')
console.log('  THE GAFFER — match-day treasury agent (core loop)')
console.log('  mode: ' + (LIVE ? 'LIVE (real gasless payouts)' : 'SIM (logic + mandate, no funds)'))
console.log('════════════════════════════════════════════════════════════')

// ── Scene 1: the organizer sets up the pot + the agent's mandate ──
const POT = 30n * U
const agent = new GafferAgent({
  seed: process.env.SEED_PHRASE || 'test test test test test test test test test test test junk',
  chainId: CHAIN_ID,
  provider: rpc,
  bundlerUrl: pim,
  paymasterUrl: pim,
  sponsorshipPolicyId: process.env.SPONSORSHIP_POLICY_ID,
  token: TOKEN,
  mandate: { perPayoutCap: 20n * U, sessionCap: POT }, // no single payout > 20; total ≤ pot
})

h('1. Organizer opens the pot + sets the agent mandate')
li('treasury: ' + (await agent.address()))
li('prize pot: ' + usdt(POT) + ' (fixed — glory model, predictions are free)')
li('mandate: per-payout ≤ ' + usdt(agent.mandate.perPayoutCap) + ', session ≤ ' + usdt(agent.mandate.sessionCap))

// ── Scene 2: the crew locks in free predictions ──
const match = new Match({ id: 'm1', fixture: 'ARG vs FRA — Final', potAmount: POT, token: TOKEN })
match.addPrediction(CREW.Tunde, 2, 1)
match.addPrediction(CREW.Amaka, 2, 1)
match.addPrediction(CREW.Ken, 3, 3)
match.addPrediction(CREW.Zara, 0, 2)
h('2. Crew locks in predictions (free entries)')
li('Tunde 2-1 · Amaka 2-1 · Ken 3-3 · Zara 0-2')
match.lock()

// ── Scene 3: full time — the result event triggers settlement ──
h('3. FULL TIME — result event: 2-1')
match.setResult(2, 1)
const report = await settleMatch(agent, match, { live: LIVE })

li(`winners: ${report.winners.length} (exact scoreline 2-1)`)
for (const p of report.payouts) {
  const who = nameOf(p.recipient)
  if (p.status === 'paid') {
    li(`✅ paid ${usdt(p.amount)} → ${who}`)
    li(`     https://sepolia.etherscan.io/tx/${p.txHash}`)
  } else if (p.status === 'submitted') {
    li(`✅ paid ${usdt(p.amount)} → ${who}   [accepted, mining] userOp ${p.userOpHash.slice(0, 14)}…`)
  } else if (p.status === 'planned') {
    li(`✅ ${usdt(p.amount)} → ${who}   [mandate ALLOWED — sim, no broadcast]`)
  } else if (p.status === 'blocked') {
    li(`⛔ ${usdt(p.amount)} → ${who}   BLOCKED: ${p.reason}`)
  } else {
    li(`⚠️  ${usdt(p.amount)} → ${who}   ${p.error || p.note}`)
  }
}
li('distributed: ' + usdt(report.distributed) + (report.rollover ? '  rollover: ' + usdt(report.rollover) : ''))
li('agent session spend: ' + usdt(agent.spent) + ' / budget ' + usdt(agent.mandate.sessionCap))

// ── Scene 4: the guardrail — the agent physically cannot overspend ──
h('4. Guardrail check — agent attempts a rogue 25 USDT payout')
try {
  const acct = await agent.account()
  await acct.transfer({ token: TOKEN, recipient: CREW.Zara, amount: 25n * U })
  li('❌ over-cap payout was NOT blocked — mandate broken')
} catch (e) {
  if (e instanceof PolicyViolationError) li(`⛔ DENIED instantly by mandate — ${e.reason} (rule: ${e.ruleName})`)
  else li('stopped downstream (not policy): ' + (e.message || String(e)).slice(0, 80))
}

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Core loop: result → winners → gasless payout → mandate-bounded.')
console.log(LIVE ? '  LIVE payouts broadcast above.' : '  Set LIVE=1 + fund the treasury to broadcast real payouts.')
console.log('════════════════════════════════════════════════════════════')

agent.dispose()

function nameOf(addr) {
  const e = Object.entries(CREW).find(([, a]) => a.toLowerCase() === addr.toLowerCase())
  return e ? e[0] : addr.slice(0, 8) + '…'
}
