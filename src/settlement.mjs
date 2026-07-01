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
      rec.userOpHash = res.hash
      agent.recordSpend(amount) // keeps the session-budget rule honest
      if (live) {
        // Payouts from one smart account serialize on its nonce: a later UserOp
        // can't be included until the earlier one mines, or the bundler drops it.
        // So we wait for on-chain inclusion before sending the next payout.
        rec.txHash = await waitForInclusion(account, res.hash)
        rec.status = rec.txHash ? 'paid' : 'submitted' // submitted = accepted, mining slow
      } else {
        rec.status = 'paid'
      }
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

/**
 * Wait for a UserOperation to be included on-chain, returning its real
 * transaction hash (or null if it doesn't confirm within the timeout).
 * @param {any} account - WDK ERC-4337 account (has getUserOperationReceipt).
 * @param {string} userOpHash
 * @param {number} [timeoutMs=120000]
 * @param {number} [pollMs=4000]
 */
async function waitForInclusion(account, userOpHash, timeoutMs = 120000, pollMs = 4000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const receipt = await account.getUserOperationReceipt?.(userOpHash).catch(() => null)
    const txHash = receipt?.receipt?.transactionHash || receipt?.transactionHash
    if (txHash) return txHash
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return null
}
