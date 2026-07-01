// Gaffer — settlement engine.
//
// The heart of the demo: a result comes in, the agent settles the fixed prize
// pot to the correct predictors as gasless USDT payouts, each one gated by the
// WDK mandate.
//
// Two honest modes, same policy engine, NO accidental spends:
//   • live=false (SIM): each payout is evaluated with `account.simulate.transfer`
//     — the real mandate verdict (ALLOW/DENY) with ZERO broadcast. Proves the
//     winner logic and the guardrail without moving a cent.
//   • live=true  (LIVE): `account.transfer` actually sends gasless USDT and we
//     wait for on-chain inclusion, capturing the real tx hash.
// Over-mandate payouts are DENIED either way (pre-broadcast).

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
      if (live) {
        const res = await account.transfer({ token: agent.token, recipient, amount })
        rec.userOpHash = res.hash
        agent.recordSpend(amount)
        // Payouts from one smart account serialize on its nonce: a later UserOp
        // can't be included until the earlier one mines, or the bundler drops it.
        rec.txHash = await waitForInclusion(account, res.hash)
        rec.status = rec.txHash ? 'paid' : 'submitted'
      } else {
        // SIM: real mandate verdict, no broadcast.
        const verdict = await account.simulate.transfer({ token: agent.token, recipient, amount })
        if (verdict.decision === 'DENY') {
          rec.status = 'blocked'
          rec.reason = verdict.reason
          rec.rule = verdict.matched_rule
        } else {
          rec.status = 'planned'
          agent.recordSpend(amount) // advance the session budget as if paid
        }
      }
    } catch (e) {
      if (e instanceof PolicyViolationError) {
        rec.status = 'blocked'
        rec.reason = e.reason
        rec.rule = e.ruleName
      } else {
        rec.status = 'failed'
        rec.error = short(e)
      }
    }
    results.push(rec)
  }

  const distributed = results
    .filter((r) => r.status === 'paid' || r.status === 'submitted' || r.status === 'planned')
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
