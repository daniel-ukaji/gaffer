// Gaffer — match feed.
//
// The bridge between "what happened on the pitch" and "what the agent does with
// money". The rest of the app never talks to a data provider directly — it
// subscribes to a MatchFeed and reacts to events. That keeps a live football API
// and a demo "simulate goal" button behind the exact same interface.
//
// Events (all carry the running score):
//   'kickoff'  { fixture, score }
//   'goal'     { team: 'home'|'away', scorer, minute, score }
//   'fulltime' { score }
//
// A real provider (football-data.org, api-football, …) would poll its HTTP API
// and emit these same events — see PollingFeed at the bottom for the shape.

import { EventEmitter } from 'node:events'

export class MatchFeed extends EventEmitter {
  /** @param {{ fixture: string, home?: string, away?: string }} opts */
  constructor({ fixture, home = 'HOME', away = 'AWAY' }) {
    super()
    this.fixture = fixture
    this.home = home
    this.away = away
    this.score = { home: 0, away: 0 }
    this.status = 'scheduled' // scheduled -> live -> ended
  }

  get scoreline() {
    return `${this.score.home}-${this.score.away}`
  }
}

/**
 * A feed you drive yourself — by hand (kickoff/goal/fullTime) for a live pitch,
 * or on a timeline (playScript) for a hands-off, reproducible demo.
 */
export class SimulatedFeed extends MatchFeed {
  kickoff() {
    if (this.status !== 'scheduled') return this
    this.status = 'live'
    this.emit('kickoff', { fixture: this.fixture, score: { ...this.score } })
    return this
  }

  /** Score for a side. @param {{ team: 'home'|'away', scorer?: string, minute?: number }} g */
  goal({ team, scorer = '', minute }) {
    if (this.status !== 'live') throw new Error('goal before kickoff / after full time')
    if (team !== 'home' && team !== 'away') throw new Error("team must be 'home' or 'away'")
    this.score[team] += 1
    this.emit('goal', { team, scorer, minute, score: { ...this.score } })
    return this
  }

  fullTime() {
    if (this.status !== 'live') return this
    this.status = 'ended'
    this.emit('fulltime', { score: { ...this.score } })
    return this
  }

  /**
   * Play a scripted match hands-off. Each step fires after `gap` ms (or its own
   * `at` override), so a whole match compresses into a few seconds for a demo.
   * @param {Array<{type:'kickoff'|'goal'|'fulltime', at?:number, team?:string, scorer?:string, minute?:number}>} steps
   * @param {{ gap?: number }} [opts]
   */
  async playScript(steps, { gap = 2200 } = {}) {
    for (const step of steps) {
      await delay(step.at ?? gap)
      if (step.type === 'kickoff') this.kickoff()
      else if (step.type === 'goal') this.goal(step)
      else if (step.type === 'fulltime') this.fullTime()
    }
    return this
  }
}

/**
 * Skeleton for a REAL provider adapter. Poll an HTTP football API on an interval,
 * diff against the last snapshot, and emit the same events. Left as a stub because
 * it needs an API key + a live fixture; the app depends only on MatchFeed's events,
 * so dropping this in later requires no changes downstream.
 *
 * @example
 *   class FootballDataFeed extends MatchFeed {
 *     constructor(opts) { super(opts); this.matchId = opts.matchId; this.apiKey = opts.apiKey }
 *     start() { this._t = setInterval(() => this._poll(), 15_000); return this }
 *     async _poll() {
 *       const m = await fetch(`https://api.football-data.org/v4/matches/${this.matchId}`,
 *         { headers: { 'X-Auth-Token': this.apiKey } }).then(r => r.json())
 *       // detect kickoff / new goals (m.score) / full time, update this.score, emit events
 *     }
 *     stop() { clearInterval(this._t) }
 *   }
 */
export const PollingFeedNote = true

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
