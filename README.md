# The Gaffer ⚽️💸

**A self-custodial match-day treasury agent.** Built on Tether's WDK for the
Tether Developers Cup (Wallets track).

A crew pools into a fixed prize pot for a match. An autonomous agent — with its
own gasless smart-account wallet and a spending mandate it *cannot* break —
settles the pot to whoever calls the scoreline right, in USDT, the instant the
result comes in. No organizer chasing payments, no house, no gas, no rake.

> **Stakes model: glory + fixed prize pot.** Predictions are free. Correct
> predictors win from a fixed/sponsor pot — not from each other. It's a prize,
> not a wager.

## Why it's real, not a mockup

The three load-bearing WDK capabilities are proven end-to-end on Sepolia — see
[SPIKE-REPORT.md](./SPIKE-REPORT.md). A real gasless UserOperation is already
mined on-chain: [tx](https://sepolia.etherscan.io/tx/0x9f1af31d08c39e8b349101550a0d78b5a9263f7ac4d9258f460446982c3060a9).

| Capability | Proof |
| --- | --- |
| Gasless USDT (ERC-4337, sponsored) | mined on Sepolia, owner holds 0 ETH |
| x402 pay-per-request (WDK signs) | 402 → sign → 200, no adapter needed |
| Mandate / spending cap | over-cap payout DENIED in ~2ms, pre-broadcast |

## The core loop

```
result event → compute winners → gasless USDT payout to each → mandate-bounded
```

Four small modules:

- `src/match.mjs` — pure domain: pot, free predictions, winner logic, pot split
- `src/agent.mjs` — WDK treasury (gasless ERC-4337) + the mandate (tx policies)
- `src/settlement.mjs` — the settle engine (one code path; sim or live)
- `gaffer-demo.mjs` — runnable end-to-end story

## Run it

```bash
npm install
cp .env.example .env      # fill in for LIVE runs

# SIM — proves logic + mandate, no funds, no keys needed:
npm run demo

# LIVE — real gasless payouts on Sepolia (needs PIMLICO_KEY + a funded treasury):
#   1) create a Pimlico API key + an ACTIVE Sepolia sponsorship policy
#   2) mint a test ERC-20 to the treasury address (printed by the demo) via
#      Pimlico's Test ERC20 Faucet, and set TOKEN to that token
#   3):
npm run demo:live
```

## Spikes (foundation proofs)

```bash
npm run spike:policy    # offline: mandate denies an over-cap spend
npm run spike:x402      # local mock: WDK wallet signs an x402 payment (402→200)
npm run spike:send      # real: land a gasless UserOp on Sepolia (needs PIMLICO_KEY)
```

## Roadmap (post-core)

- Live match-feed adapter (+ a "simulate goal" control for the demo)
- x402-paid match data buy by the agent (`@x402/fetch` + `@x402/evm` — wired in spikes)
- React Native app (WDK RN starter + UI Kit) — the fan-facing crew screens
- ZK-shielded contributions (individual amounts private, pot total auditable)

## Stack

WDK (`@tetherto/wdk`, `wdk-wallet-evm`, `wdk-wallet-evm-erc-4337`), x402
(`@x402/fetch`, `@x402/evm`), Safe + abstractionkit + Pimlico (bundler/paymaster),
Sepolia. Node ≥ 20.
