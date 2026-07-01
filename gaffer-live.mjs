// Gaffer — LIVE match runner.
//
// Wires a match feed straight into the treasury agent: predictions lock at
// kickoff, the score ticks over on goals, and the final whistle triggers the
// gasless payout to correct predictors. The football event *is* the settlement
// trigger — that's the whole pitch, running end to end.
//
// Two ways to run:
//   node gaffer-live.mjs                # scripted: a compressed match auto-plays
//   node gaffer-live.mjs --interactive  # you drive: h=home goal  a=away goal  f=full time
//
// SIM by default (no funds). Add LIVE=1 (+ .env) for real gasless payouts.

import { Match } from './src/match.mjs'
import { GafferAgent } from './src/agent.mjs'
import { settleMatch } from './src/settlement.mjs'
import { SimulatedFeed } from './src/feed.mjs'

const U = 1_000_000n
const usdt = (n) => (Number(n) / 1e6).toFixed(2) + ' USDT'
const log = (s = '') => console.log(s)
const b = (s) => '\x1b[1m' + s + '\x1b[0m'

const LIVE = process.env.LIVE === '1'
const INTERACTIVE = process.argv.includes('--interactive') || process.argv.includes('-i')
const CHAIN_ID = 11155111
const KEY = process.env.PIMLICO_KEY
const rpc = process.env.RPC_URL || 'https://sepolia.drpc.org'
const pim = KEY ? `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${KEY}` : `https://public.pimlico.io/v2/${CHAIN_ID}/rpc`
const TOKEN = process.env.TOKEN || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const CREW = {
  Tunde: '0x1111111111111111111111111111111111111111',
  Amaka: '0x2222222222222222222222222222222222222222',
  Ken: '0x3333333333333333333333333333333333333333',
  Zara: '0x4444444444444444444444444444444444444444',
}
const nameOf = (addr) => Object.entries(CREW).find(([, a]) => a.toLowerCase() === addr.toLowerCase())?.[0] || addr.slice(0, 8) + '…'

// ── Setup: pot, agent mandate, predictions ──
const POT = 30n * U
const agent = new GafferAgent({
  seed: process.env.SEED_PHRASE || 'test test test test test test test test test test test junk',
  chainId: CHAIN_ID, provider: rpc, bundlerUrl: pim, paymasterUrl: pim,
  sponsorshipPolicyId: process.env.SPONSORSHIP_POLICY_ID,
  token: TOKEN, mandate: { perPayoutCap: 20n * U, sessionCap: POT },
})
const match = new Match({ id: 'm1', fixture: 'ARG vs FRA — Final', potAmount: POT, token: TOKEN })
match.addPrediction(CREW.Tunde, 2, 1)
match.addPrediction(CREW.Amaka, 2, 1)
match.addPrediction(CREW.Ken, 3, 3)
match.addPrediction(CREW.Zara, 0, 2)

log('════════════════════════════════════════════════════════════')
log('  THE GAFFER — live match → gasless payout')
log('  mode: ' + (LIVE ? 'LIVE payouts' : 'SIM') + (INTERACTIVE ? ' · interactive (h/a/f)' : ' · scripted'))
log('════════════════════════════════════════════════════════════')
log(b(match.fixture) + '   pot ' + usdt(POT) + '   treasury ' + (await agent.address()))
log('predictions:  Tunde 2-1 · Amaka 2-1 · Ken 3-3 · Zara 0-2')
log('mandate:      per-payout ≤ ' + usdt(agent.mandate.perPayoutCap) + ' · session ≤ ' + usdt(agent.mandate.sessionCap))

// ── Wire the feed to the agent ──
const feed = new SimulatedFeed({ fixture: match.fixture, home: 'ARG', away: 'FRA' })
let settling = false

feed.on('kickoff', () => {
  match.lock()
  log('\n\x1b[36m▶ KICKOFF\x1b[0m — predictions locked')
})

feed.on('goal', ({ team, score }) => {
  const who = team === 'home' ? feed.home : feed.away
  log(`\x1b[33m⚽ GOAL\x1b[0m ${who}!  ${feed.home} ${score.home}-${score.away} ${feed.away}`)
  // (roadmap) the agent can pull live match data here, paying per-call via x402.
})

feed.on('fulltime', async ({ score }) => {
  if (settling) return
  settling = true
  log(`\n\x1b[36m⏹ FULL TIME\x1b[0m — ${feed.home} ${score.home}-${score.away} ${feed.away}`)
  match.setResult(score.home, score.away)

  log(b('\nThe agent settles the pot:'))
  const report = await settleMatch(agent, match, { live: LIVE })
  if (report.winners.length === 0) {
    log(`  no exact-score winners — ${usdt(report.rollover)} rolls over to the crew`)
  }
  for (const p of report.payouts) {
    const who = nameOf(p.recipient)
    if (p.status === 'paid') { log(`  ✅ ${usdt(p.amount)} → ${who}`); log(`       https://sepolia.etherscan.io/tx/${p.txHash}`) }
    else if (p.status === 'submitted') log(`  ✅ ${usdt(p.amount)} → ${who}  [accepted, mining] ${p.userOpHash.slice(0, 14)}…`)
    else if (p.status === 'planned') log(`  ✅ ${usdt(p.amount)} → ${who}  [mandate ALLOWED — sim, no broadcast]`)
    else if (p.status === 'blocked') log(`  ⛔ ${usdt(p.amount)} → ${who}  BLOCKED: ${p.reason}`)
    else log(`  ⚠️  ${usdt(p.amount)} → ${who}  ${p.error || p.note}`)
  }
  log(`  distributed ${usdt(report.distributed)} · agent spend ${usdt(agent.spent)}/${usdt(agent.mandate.sessionCap)}`)
  log('\n════════════════════════════════════════════════════════════')
  log('  A goal ended the match; the money settled itself. That\'s Gaffer.')
  log('════════════════════════════════════════════════════════════')
  cleanup()
  process.exit(0)
})

// ── Drive the feed ──
if (INTERACTIVE) {
  log('\n' + b('Controls:') + '  h = ARG goal   a = FRA goal   f = full time   q = quit')
  log('(press keys to drive the match…)')
  feed.kickoff()
  setupKeys()
} else {
  // Compressed match: kickoff, three goals, full whistle — ~11s of drama.
  await feed.playScript([
    { type: 'kickoff' },
    { type: 'goal', team: 'home', scorer: 'Messi', minute: 23 },
    { type: 'goal', team: 'away', scorer: 'Mbappé', minute: 41 },
    { type: 'goal', team: 'home', scorer: 'Di María', minute: 68 },
    { type: 'fulltime' },
  ])
}

function setupKeys() {
  const stdin = process.stdin
  if (!stdin.isTTY) { log('(no TTY — falling back to scripted)'); return void feed.playScript([{ type: 'goal', team: 'home' }, { type: 'goal', team: 'away' }, { type: 'goal', team: 'home' }, { type: 'fulltime' }]) }
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
  stdin.on('data', (key) => {
    if (key === '' || key === 'q') { log('\n(quit)'); cleanup(); process.exit(0) }
    else if (key === 'h') feed.goal({ team: 'home' })
    else if (key === 'a') feed.goal({ team: 'away' })
    else if (key === 'f') feed.fullTime()
  })
}

function cleanup() {
  if (process.stdin.isTTY) try { process.stdin.setRawMode(false) } catch {}
  agent.dispose()
}
