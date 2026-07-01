// Gaffer — match domain model (pure logic, no WDK, no network).
//
// Model: "glory + fixed prize pot". A match has ONE fixed prize pot (funded by
// the crew/sponsor). Predictions are FREE score guesses (glory, not wagers).
// Correct predictors (exact scoreline) split the fixed pot equally. This keeps
// the product clean of peer-wagering — the money is a prize, not a bet.
//
// All amounts are bigint base units (e.g. USDT 6dp: 1 USDT = 1_000_000n).

/** @typedef {{ home: number, away: number }} Score */
/** @typedef {{ recipient: string, amount: bigint }} Payout */

export class Match {
  /**
   * @param {object} opts
   * @param {string} opts.id - Match id.
   * @param {string} opts.fixture - Human label, e.g. "ARG vs FRA — Final".
   * @param {bigint} opts.potAmount - Fixed prize pot (base units).
   * @param {string} opts.token - ERC-20 token address the pot/payouts use.
   */
  constructor({ id, fixture, potAmount, token }) {
    if (typeof potAmount !== 'bigint' || potAmount <= 0n)
      throw new Error('potAmount must be a positive bigint (base units)')
    this.id = id
    this.fixture = fixture
    this.potAmount = potAmount
    this.token = token
    /** @type {Map<string, Score>} address (lowercased) -> predicted score */
    this.predictions = new Map()
    /** @type {Score | null} */
    this.result = null
    this.status = 'open' // open -> locked -> settled
  }

  /**
   * Record a free score prediction for a crew member. Last write wins until lock.
   * @param {string} address
   * @param {number} home
   * @param {number} away
   */
  addPrediction(address, home, away) {
    if (this.status !== 'open') throw new Error(`match ${this.id} is ${this.status}, not open`)
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('invalid address: ' + address)
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)
      throw new Error('scores must be non-negative integers')
    this.predictions.set(address.toLowerCase(), { home, away })
    return this
  }

  /** Lock predictions at kickoff — no more entries. */
  lock() {
    this.status = 'locked'
    return this
  }

  /**
   * Set the final result (the "goal/result event"). Locks if still open.
   * @param {number} home
   * @param {number} away
   */
  setResult(home, away) {
    if (this.status === 'settled') throw new Error('match already settled')
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)
      throw new Error('result scores must be non-negative integers')
    this.result = { home, away }
    if (this.status === 'open') this.status = 'locked'
    return this
  }

  /**
   * Addresses whose prediction exactly matches the result. Deterministic order
   * (insertion order) so payout splitting is reproducible.
   * @returns {string[]}
   */
  computeWinners() {
    if (!this.result) throw new Error('no result set')
    const { home, away } = this.result
    const winners = []
    for (const [addr, p] of this.predictions) {
      if (p.home === home && p.away === away) winners.push(addr)
    }
    return winners
  }

  /**
   * Split the fixed pot equally among winners. Remainder (dust that doesn't
   * divide evenly) is handed out 1 base unit at a time to the earliest winners,
   * so the full pot is always distributed and the split is deterministic.
   * No winners -> empty payouts (pot rolls over to the caller's discretion).
   * @returns {{ winners: string[], payouts: Payout[], rollover: bigint }}
   */
  splitPot() {
    const winners = this.computeWinners()
    if (winners.length === 0) {
      return { winners, payouts: [], rollover: this.potAmount }
    }
    const n = BigInt(winners.length)
    const base = this.potAmount / n
    let remainder = this.potAmount - base * n // 0 <= remainder < n
    const payouts = winners.map((recipient) => {
      let amount = base
      if (remainder > 0n) {
        amount += 1n
        remainder -= 1n
      }
      return { recipient, amount }
    })
    return { winners, payouts, rollover: 0n }
  }
}
