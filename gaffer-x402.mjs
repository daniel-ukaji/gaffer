// Gaffer — the agent earns its keep (x402 + payout).
//
// The full autonomous money loop: the agent PAYS per request in USDT (x402) to
// buy live match data, then PAYS OUT the pot to correct predictors — all on its
// own, no human, no cards. Two directions of agentic USDT commerce in one run.
//
//   node gaffer-x402.mjs           # settlement in SIM (x402 buys are always real signing)
//   LIVE=1 … node gaffer-x402.mjs  # settlement broadcasts real gasless payouts too

import { createDataAgent, startPaidMatchDataService } from './src/paidData.mjs'
import { Match } from './src/match.mjs'
import { GafferAgent } from './src/agent.mjs'
import { settleMatch } from './src/settlement.mjs'

const U = 1_000_000n
const usdt = (n) => (Number(n) / 1e6).toFixed(2) + ' USDT'
const micros = (s) => (Number(s) / 1e6).toFixed(2) + ' USD₮'
const log = (s = '') => console.log(s)
const b = (s) => '\x1b[1m' + s + '\x1b[0m'

const LIVE = process.env.LIVE === '1'
const CHAIN_ID = 11155111
const KEY = process.env.PIMLICO_KEY
const rpc = process.env.RPC_URL || 'https://sepolia.drpc.org'
const pim = KEY ? `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${KEY}` : `https://public.pimlico.io/v2/${CHAIN_ID}/rpc`
const TOKEN = process.env.TOKEN || '0xd077A400968890Eacc75cdc901F0356c943e4fDb'
const SEED = process.env.SEED_PHRASE || 'test test test test test test test test test test test junk'
const DATA_PROVIDER = '0x00000000000000000000000000000000000FEED5' // where the feed provider gets paid

const CREW = {
  Tunde: '0x1111111111111111111111111111111111111111',
  Amaka: '0x2222222222222222222222222222222222222222',
  Ken: '0x3333333333333333333333333333333333333333',
  Zara: '0x4444444444444444444444444444444444444444',
}
const nameOf = (a) => Object.entries(CREW).find(([, x]) => x.toLowerCase() === a.toLowerCase())?.[0] || a.slice(0, 8) + '…'

log('════════════════════════════════════════════════════════════')
log('  THE GAFFER — the agent earns its keep (x402 → payout)')
log('  settlement: ' + (LIVE ? 'LIVE' : 'SIM') + '   ·   x402 data buys: REAL signed payments')
log('════════════════════════════════════════════════════════════')

// ── The paywalled match-data service (what a real feed provider runs) ──
const svc = await startPaidMatchDataService({
  chainId: CHAIN_ID,
  payTo: DATA_PROVIDER,
  asset: TOKEN,
  priceMicros: '10000', // 0.01 USD₮ per call
  resources: {
    '/match/preview': {
      description: 'Pre-match preview',
      body: { fixture: 'ARG vs FRA — Final', form: { ARG: 'WWWDW', FRA: 'WWLWW' }, modelPrediction: '2-1', note: 'Messi in form; FRA missing a starter.' },
    },
    '/match/result': {
      description: 'Official full-time result',
      body: { fixture: 'ARG vs FRA — Final', status: 'FT', result: { home: 2, away: 1 } },
    },
  },
})

// ── The agent's data-purchasing wallet (WDK, x402 payer) ──
const dataAgent = await createDataAgent({ seed: SEED, provider: rpc, chainId: CHAIN_ID })
log(b('\nAgent operating wallet (pays for data via x402):'))
log('  ' + dataAgent.address)

// ── The agent buys the pre-match preview, paying per request ──
log(b('\n1. Agent buys the pre-match preview  ') + '(x402: 402 → sign → 200)')
const preview = await dataAgent.buy(`${svc.url}/match/preview`)
log('   💳 paid 0.01 USD₮ over HTTP for data')
log(`   📊 preview: ${preview.data.fixture} · model says ${preview.data.modelPrediction} · ${preview.data.note}`)

// ── Crew predictions + pot + mandate ──
const POT = 30n * U
const agent = new GafferAgent({
  seed: SEED, chainId: CHAIN_ID, provider: rpc, bundlerUrl: pim, paymasterUrl: pim,
  sponsorshipPolicyId: process.env.SPONSORSHIP_POLICY_ID, token: TOKEN,
  mandate: { perPayoutCap: 20n * U, sessionCap: POT },
})
const match = new Match({ id: 'm1', fixture: 'ARG vs FRA — Final', potAmount: POT, token: TOKEN })
match.addPrediction(CREW.Tunde, 2, 1).addPrediction(CREW.Amaka, 2, 1).addPrediction(CREW.Ken, 3, 3).addPrediction(CREW.Zara, 0, 2)
match.lock()
log(b('\n2. Crew locked in:') + '  Tunde 2-1 · Amaka 2-1 · Ken 3-3 · Zara 0-2   (pot ' + usdt(POT) + ')')

// ── Full time: the agent buys the OFFICIAL result via x402, then settles ──
log(b('\n3. Full time — agent buys the official result  ') + '(x402)')
const official = await dataAgent.buy(`${svc.url}/match/result`)
const r = official.data.result
log(`   💳 paid 0.01 USD₮ over HTTP · official result: ${r.home}-${r.away}`)
match.setResult(r.home, r.away)

log(b('\n4. Agent settles the pot to correct predictors:'))
const report = await settleMatch(agent, match, { live: LIVE })
for (const p of report.payouts) {
  const who = nameOf(p.recipient)
  if (p.status === 'paid') { log(`   ✅ ${usdt(p.amount)} → ${who}`); log(`        https://sepolia.etherscan.io/tx/${p.txHash}`) }
  else if (p.status === 'submitted') log(`   ✅ ${usdt(p.amount)} → ${who}  [accepted, mining]`)
  else if (p.status === 'planned') log(`   ✅ ${usdt(p.amount)} → ${who}  [mandate ALLOWED — sim, no broadcast]`)
  else if (p.status === 'blocked') log(`   ⛔ ${usdt(p.amount)} → ${who}  ${p.reason}`)
  else log(`   ⚠️  ${usdt(p.amount)} → ${who}  ${p.error || p.note}`)
}

// ── The agent's own P&L for the match ──
const spentOnData = svc.payments.reduce((s, p) => s + Number(p.amount), 0)
log(b('\nAgent ledger for this match:'))
log(`   data bought via x402 : ${svc.payments.length} calls, ${micros(String(spentOnData))} total`)
for (const p of svc.payments) log(`      · ${p.path}  ${micros(p.amount)}  from ${p.from ? p.from.slice(0, 10) + '…' : '(signed)'}`)
log(`   pot paid out         : ${usdt(report.distributed)} to ${report.winners.length} winners`)

log('\n════════════════════════════════════════════════════════════')
log('  Agent-to-service AND agent-to-fan — both in USDT, both autonomous.')
log('  That\'s WDK: an agent that pays for what it needs and pays out fairly.')
log('════════════════════════════════════════════════════════════')

await svc.close()
dataAgent.dispose()
agent.dispose()
