// Gaffer — settlement engine.
//
// The heart of the demo: a result comes in, the agent settles the fixed prize
// pot to the correct predictors as gasless USDT payouts, each one passing
// through the WDK mandate before it can broadcast.
//
// One code path, two truths:
//   • live=false (unfunded): every ALLOWED payout passes the mandate then stops
//     at the funding boundary — proving the winner logic + mandate without money.
//   • live=true  (funded):   the same call sends real gasless USDT and returns a
//     transaction hash.
// Either way, an over-mandate payout is DENIED by policy, pre-broadcast.

import { PolicyViolationError } from './agent.mjs'

/**
 * @param {import('./agent.mjs').GafferAgent} agent
 * @param {import('./match.mjs').Match} match
 * @param {object} [opts]
 * @param {boolean} [opts.live=false] - Actually broadcast (requires a funded treasury).
 * @returns {Promise<object>} settlement report
 */
export async function settleMatch(agent, match, { live = false } = {}) {
  if (!match.result) throw new Error('cannot settle: no result set')
  const account = await agent.account()
  const { winners, payouts, rollover } = match.splitPot()

  const results = []
  for (const { recipient, amount } of payouts) {
    const rec = { recipient, amount, status: 'pending' }
    try {
      const res = await account.transfer({ token: agent.token, recipient, amount })
      rec.status = 'paid'
      rec.hash = res.hash
      agent.recordSpend(amount) // keeps the session-budget rule honest
    } catch (e) {
      if (e instanceof PolicyViolationError) {
        rec.status = 'blocked'
        rec.reason = e.reason
        rec.rule = e.ruleName
      } else if (live) {
        rec.status = 'failed'
        rec.error = short(e)
      } else {
        // Unfunded sim: mandate ALLOWED it; it stopped at the funding/bundler edge.
        rec.status = 'allowed_pending'
        rec.note = short(e)
        agent.recordSpend(amount) // simulate the spend so session budget advances
      }
    }
    results.push(rec)
  }

  const distributed = results
    .filter((r) => r.status === 'paid' || r.status === 'allowed_pending')
    .reduce((s, r) => s + r.amount, 0n)

  match.status = 'settled'
  return {
    fixture: match.fixture,
    result: match.result,
    token: match.token,
    pot: match.potAmount,
    winners,
    payouts: results,
    distributed,
    rollover, // non-zero only when nobody predicted correctly
    live,
  }
}

const short = (e) => (e?.message || String(e)).slice(0, 120)
