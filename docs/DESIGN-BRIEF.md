# The Gaffer — Web App Design Brief

A ready-to-use prompt for designing the Gaffer web UI with Airbnb's Design
Language System (DLS) method. Paste the section below (from "You are a senior
product designer…") into a design tool / Claude. Pitch fidelity decision:
**minimal goal-moment only — a scoreboard + goal flash, no player/ball
simulation** (the autonomous agent and the money are the stars, not a football
game).

---

You are a senior product designer. Design the complete UI for a web app called **The Gaffer**, using Airbnb's Design Language System (DLS) method: build it systematically from principles → design tokens → a component library → fully-specified screens → motion → accessibility. Do not jump straight to screens; establish the system first, then compose screens from it. Every screen must be a composition of defined tokens and components — nothing bespoke or unsystematic.

## 1. Product context (design for this, exactly)

The Gaffer is a **self-custodial match-day treasury agent**. A group of friends ("a crew") pools a fixed prize pot for a football match. An autonomous agent — with its own gasless wallet and a spending mandate it *cannot* break — settles the pot to whoever predicts the exact scoreline, in USDT, the instant the match ends. No organizer chasing payments, no house, no gas fees, no rake. The agent even **pays per-request in USDT** (via x402) to buy the live match data it needs.

This is a hackathon submission (Tether Developers Cup, Wallets track), judged live on: **technical ambition, UX, real-world utility, creativity, and real use of the wallet platform.** The UI's job is to make invisible, complex crypto machinery feel like a warm, effortless, human thing — and to deliver one unforgettable "wow" moment: **money flying to the winners the instant the whistle blows.**

**Non-negotiable framing:** this is *not* a betting/gambling app. Predictions are free; winners take a **prize**, not each other's stakes. Never use casino/betting visual language (no odds, no chips, no slot aesthetics). The star of the story is the **autonomous agent**, not wagering.

**Real sample data to use in all mockups (no placeholders):**
- Fixture: **ARG vs FRA — Final**
- Crew: **Tunde**, **Amaka**, **Ken**, **Zara**
- Predictions: Tunde 2‑1 · Amaka 2‑1 · Ken 3‑3 · Zara 0‑2
- Fixed prize pot: **30.00 USDT**
- Agent mandate: per‑payout ≤ 20 USDT · session ≤ 30 USDT
- x402 data buys: 0.01 USDT per call (preview + official result)
- Final result: **2‑1** → Tunde & Amaka each win **15.00 USDT**
- Real tx (show as clickable, truncated): `0xa170…5215`, `0xd087…29a8`
- Agent treasury address: `0x9768…F6F2`

## 2. Design principles (derive everything from these four)

1. **Effortless, not simple-minded.** The plumbing is hard; the experience is calm. A first-timer never sees "gas," "network," "approve," or a seed phrase. Hide machinery; surface outcomes.
2. **Alive on match day.** The interface has a pulse — it reacts to the game in real time. Energy and warmth of a stadium, restraint and trust of a bank.
3. **Radically transparent.** Every cent is accounted for and provable. Money moves are always shown with a clear "who → whom → how much," and receipts link to on-chain proof. Trust is designed in, not asserted.
4. **The agent is a character.** The autonomous agent has a visible, legible presence — you can *feel* it working (fetching data, settling, refusing to overspend). Give it a consistent identity, voice, and status surface.

## 3. Art direction

Mood: **"floodlit final, settled in a heartbeat."** Premium, dark-first (a night match under stadium lights) so money glows and celebrations pop. Warm and human like Airbnb, but with sporting charge. Generous whitespace, soft depth, rounded and friendly, confident typography, purposeful motion. Avoid crypto clichés (no neon grids, no hexagon meshes, no "matrix"). Think: a beautifully designed sports-finance app a normal person would love.

## 4. Design tokens (define these first, as CSS custom properties, and use them everywhere)

**Color — dark-first, semantic. Provide hex + usage. Also provide a light theme mapping.**
- Canvas `--bg`: `#0A0E13` · Elevated surface `--surface`: `#121821` · Card `--surface-2`: `#18202B` · Hairline/border `--border`: `rgba(255,255,255,0.08)`
- Text: primary `#F4F7FB`, secondary `#A7B4C2`, tertiary/muted `#6B7889`
- **Brand "Pitch"** (primary action, money-positive, USDT): `#16C784`, hover `#13B074`, subtle bg `rgba(22,199,132,0.12)`
- **"Roar"** (celebration/payout highlight): gold `#FFC94D` + glow
- **"Floodlight"** (the agent / x402 / machine layer — use this to signal autonomous activity): electric cyan `#4CC9FF`
- **"Denied"** (mandate block, danger): `#FF5A5F` (a deliberate nod to Airbnb's Rausch)
- Warn `#FFB020` · Success = Pitch green
- Money glow shadow: `0 0 40px rgba(22,199,132,0.35)`

**Typography** — three families, all with **tabular lining figures** enabled for any number that represents money or a score:
- Display (hero numbers, scores, big money): a bold characterful grotesk — **Clash Display** (fallback *Space Grotesk*).
- UI/body: **Inter** (fallback system-ui), `font-feature-settings:"tnum","cv05"`.
- Mono (addresses, tx hashes): **JetBrains Mono** (fallback ui-monospace).
- Scale (px): Display‑XL 64/1.0, Display‑L 44/1.05, H1 32/1.15, H2 24/1.2, H3 20/1.3, Body‑L 18/1.5, Body 16/1.5, Body‑S 14/1.45, Caption 12/1.4. Weights 400/500/600/700.

**Spacing** (8‑pt base, 4 half‑step): 4, 8, 12, 16, 24, 32, 48, 64, 96.
**Radius**: sm 8, md 12, lg 16, xl 24, pill 999. Cards 16–20; buttons 12 or pill.
**Elevation** (soft, low-spread on dark): e1 `0 2px 8px rgba(0,0,0,.35)`, e2 `0 8px 24px rgba(0,0,0,.45)`, e3 `0 20px 60px rgba(0,0,0,.55)`; plus semantic glows (money/celebration).
**Motion**: durations — micro 120ms, default 200ms, enter 320ms, hero 480–700ms. Easing — standard `cubic-bezier(.2,.8,.2,1)`, celebratory spring with slight overshoot. Every motion must have a `prefers-reduced-motion` fallback (crossfade, no travel).
**Iconography**: rounded, 1.75px stroke, 24px grid, friendly not technical.

## 5. Core component library (specify each: anatomy, sizes, all states — default/hover/active/focus/disabled/loading)

Buttons (primary/secondary/ghost/destructive, + pill CTA), Input & slider (mandate sliders), Scoreline picker (stepper for home–away), Prediction chip, Avatar + AvatarStack (crew roster), Money amount (tabular, with USDT ticker + optional +/− trend), Badge/Pill (status: "gasless", "locked", "FT", "sponsored"), Card (base + interactive), Tabs, Toast/Snackbar, Modal/Sheet, Progress/pot-fill bar, Copyable address/tx chip (mono, truncated, click-to-copy, external-link to Etherscan), Skeleton loaders, Empty states.

## 6. Signature components (the ones that make Gaffer *Gaffer* — spec in depth)

- **Agent Presence (`AgentOrb` + status strip):** a persistent, calm identity for the autonomous agent in the top bar. A soft "Floodlight"-cyan orb that gently breathes when idle, pulses when it acts, and shows a one-line status ("Watching the match…", "Bought live data · 0.01 USDT", "Settling…", "Refused an over-limit payout"). This is how the audience *sees* autonomy.
- **Match Moment (`Scoreboard` + `GoalFlash`):** a clean, premium scoreboard — team badges, `ARG 2–1 FRA`, live minute (68'), and a "gasless" match-status pill. It is **not** a pitch or a game; there are no moving players. On a goal event: a fast **net-ripple + flash** on the scoring side, the score digit ticks up with a spring, a brief "GOAL — ARG" banner, and it **hands off directly to the money-flow** at full time. All motion is choreographed from feed events (goal/score/full-time), never simulated. Football *flavor*, not a football *game*.
- **Pot & Crew panel:** the fixed prize pot as a hero number, a live-filling ring/bar, and the crew roster with each member's locked prediction chip.
- **Money-Flow (the hero):** animated USDT tokens/streams launching from the pot and landing on winner cards, which light up "Roar" gold with the amount counting up. Loser/no-win cards stay calm and dim slightly.
- **Mandate Guardrail:** when the agent attempts an over-limit payout, a "Denied" (`#FF5A5F`) card/toast snaps in — "Blocked by mandate: single payout exceeds 20 USDT" — conveying *the agent literally cannot overspend*. This is a scoring beat; make it crisp and legible.
- **Receipt/Ledger row:** transparent line items (contributions in, data bought via x402, payouts out) each with amount + counterpart + a mono tx chip linking to Etherscan.

## 7. Screens (design each at desktop 1440 and mobile 390; specify grid, layout, content with the real data above, every state, and motion)

- **S0 · Landing / hero.** One-line promise, the wow in a loop (money settling), a single CTA ("Start a crew"). Communicate "not betting — a prize pot that pays itself out."
- **S1 · Create Crew (organizer).** Set fixture, prize pot, and the mandate via friendly sliders (per-payout cap, session cap) — plain language, never "policy." Show the derived agent treasury address. Output: a shareable crew link/QR.
- **S2 · Join & Predict (fan).** Join via link; pick a scoreline (stepper); confirm in <30s. Emphasize "no gas, no crypto knowledge, pay like any app." States: joining, prediction locked, late (predictions closed).
- **S3 · Match Room — Pre-match.** The agent buys the **preview via x402** (show the 0.01 USDT pay + the returned preview: form, model prediction), the crew roster with locked predictions, the pot filled. Countdown to kickoff.
- **S4 · Match Room — Live.** Centerpiece is the **Scoreboard** (Match Moment), calm and alive — minute ticking, status pill. The **AgentOrb** pulses as the agent works; **x402 data pulses** (cyan) appear when it buys data. Crew roster with locked predictions sits alongside; the pot rests below. On each goal: `GoalFlash` fires and the score ticks — no player/ball simulation anywhere. A discreet **"simulate goal" control** (home / away / full-time), clearly framed as a demo control, drives it on cue. States: pre-kickoff, in-play, goal-just-scored, approaching full-time.
- **S5 · Full Time — Settlement (THE hero).** See §8.
- **S6 · Receipt / Ledger.** Full transparency: pot in, 0.02 USDT data bought, 30 USDT paid to Tunde & Amaka, tx links, and the guardrail event logged. "Everyone can verify; no one had to trust anyone."

For every screen provide: purpose, layout grid, annotated element list, and **all states** — loading (skeletons), empty, active, success, error, and the domain states (predictions-locked, no-winner rollover, mandate-denied).

## 8. The hero moment — full-time settlement (choreograph beat by beat)

The single most important 6 seconds. Storyboard it frame by frame:
1. Whistle → `GoalFlash` settles and the scoreboard locks "FT 2–1" (no pitch in frame), subtle screen settle.
2. AgentOrb pulses; status: "Settling the pot…".
3. Winner cards (Tunde, Amaka) rise/brighten; non-winners dim gently.
4. From the pot, USDT streams **fly** to each winner; on arrival the amount counts up 0 → 15.00 and the card flashes "Roar" gold with a soft glow.
5. A "gasless" + "settled in 1.2s" badge lands; "no house · pool stays with the crew" line sits in view (the non-gambling defense, on-screen).
6. Receipts materialize with tx chips.
7. **Guardrail encore:** the agent tries a rogue 25 USDT payout → "Denied" card snaps in. Ends on "the agent can't go rogue."

Specify durations, easing (spring on the count-up and card pop), stagger between winners, and a full `prefers-reduced-motion` version (crossfades, instant amounts, no travel).

## 9. Voice & microcopy

Warm, confident, plain-spoken, a little match-day swagger. Money and outcomes in human terms ("Tunde called it. 15 USDT, sent."). Never expose jargon in the primary flow (no "UserOperation," "paymaster," "nonce," "EIP-3009"); those may appear only in the receipt's "details" affordance. Provide microcopy for every button, empty state, and the hero.

## 10. Responsive, accessibility, quality bar

- Breakpoints: mobile 390, tablet 768, desktop 1440 (design mobile + desktop minimum). The scoreboard/match-moment scales and reflows gracefully.
- WCAG 2.1 AA: verify contrast for every text/bg pair (list the ratios). Visible focus rings. Full keyboard path. Screen-reader announcements for live score changes and money movements (aria-live). **A complete reduced-motion experience** — this app is motion-heavy, so the static version must still tell the whole story.
- Deliver pixel-clean, consistent spacing, aligned tabular numerals, and a coherent system — no one-off values.

## 11. Deliverables (produce, in order)

1. **Design principles** (the four, expanded).
2. **Token sheet** (color, type, spacing, radius, elevation, motion) as CSS variables + a visual swatch/type-scale specimen.
3. **Component sheet** — every component with all states.
4. **High-fidelity screens** S0–S6 at desktop + mobile, annotated, using the real sample data.
5. **The hero settlement** as an animated, self-contained HTML/CSS/JS artifact (loops, and includes a reduced-motion version).
6. A short **rationale** tying choices back to the four principles and the five judging axes.

Prefer to output as clean, self-contained **HTML + CSS (+ minimal JS for the hero motion)** so it can be reviewed live and evolve toward the real front-end. Keep everything themeable via the tokens.
