# Gaffer — WDK day-one spike report (2026-07-01)

Verdict: **GREEN. The pitch is buildable.** All three load-bearing WDK calls run.
Nothing in the concept is fictional. The only remaining work to land real
on-chain sends is free-tier account setup (bundler key + funded/sponsored
paymaster), not code.

Node 20.20, npm 10.8. Chain used for reads: Sepolia (11155111), public RPC.

---

## Call #1 — Gasless USDT transfer (ERC-4337)  ✅ code-path proven, ops-pending

- **Gotcha (important):** gasless is NOT in `@tetherto/wdk-wallet-evm`. That
  package is EOA-only (`WalletAccountEvm`, plain `transfer`). Gasless lives in a
  **separate** package: **`@tetherto/wdk-wallet-evm-erc-4337`** (`1.0.0-beta.10`).
  The base config has no paymaster fields at all — easy to waste a day here.
- Built on **Safe smart accounts + `abstractionkit` (Candide) + a bundler**.
- `new WalletManagerEvmErc4337(seed, config)` where config =
  `{ chainId, provider, bundlerUrl, safeModulesVersion:'0.3.0', ...paymaster }`.
- Three gas modes (pick one in config, or override per-call):
  - **token**: `{ paymasterUrl, paymasterAddress, paymasterToken:{address} }` → user pays gas in USDT ← this is the pitch's "no gas token" UX
  - **sponsored**: `{ isSponsored:true, paymasterUrl, sponsorshipPolicyId? }`
  - **native**: `{ useNativeCoins:true }`
- Transfer API: `account.transfer({ token, recipient, amount })` → `{hash,...}`.
- Proven live: SDK loads, config validates, **Safe address derived**
  (deterministic CREATE2 → survives reinstalls, good for key-escrow story),
  **live Sepolia balance reads OK**, and code executes all the way to a **real
  bundler RPC call** (`eth_estimateUserOperationGas`). It stops only at the
  external bundler boundary.
- **To land a real gasless send:** a bundler URL w/ API key (Pimlico or Candide,
  free tier) + a paymaster that will sponsor OR a smart account holding the
  paymaster token. Set `BUNDLER_URL`/`PAYMASTER_*` env and re-run `spike1-gasless.mjs`.

## Call #2 — x402 paid request signed by WDK wallet  ✅ FULLY proven (client side)

- Packages: `@x402/fetch`, `@x402/evm` (both `2.17.0`). Exports match docs:
  `x402Client`, `wrapFetchWithPayment`, `registerExactEvmScheme`.
- **The "no adapter required" claim holds** — a WDK `WalletAccountEvm` was passed
  DIRECTLY as the x402 signer (`{ address, signTypedData }`) and signed fine. Keep
  a ~6-line adapter on standby only if a token needs `EIP712Domain` stripped.
- **Protocol gotcha:** x402 **v2** (what `exact/client` registers) does NOT use
  the JSON body or `X-PAYMENT`. Requirements go out in a base64 **`PAYMENT-REQUIRED`
  response header**; the signed payment comes back in a **`PAYMENT-SIGNATURE`**
  header. (v1 = body + `X-PAYMENT`; there's a separate `exact/v1/client`.)
  V2 requirement fields: `{scheme, network:'eip155:<id>', amount, asset, payTo,
  maxTimeoutSeconds, extra:{name,version}}` + top-level `resource:{url,...}`.
- Proven end-to-end against a local mock: **402 → WDK signs EIP-3009 auth →
  retry with PAYMENT-SIGNATURE → 200 with paid data.** Signature present, `from`
  = WDK account. No funding needed for the client-side signing proof.
- **To land real settlement:** a funded wallet + a real facilitator (settles the
  EIP-3009 auth on-chain). Same ops gap as #1.

## Call #3 — Transaction policy denies over-cap spend  ✅ FULLY proven

- Orchestrator: `new WDK(seed).registerWallet('crew', WalletManagerEvmErc4337, cfg)`
  then `wdk.registerPolicy({...})`; `wdk.getAccount('crew',0)` returns a **Proxy**
  that throws `PolicyViolationError` from write methods on DENY.
- Policy shape: `{id,name,scope:'account',wallet,accounts:[0],rules:[...]}`;
  rule `{name,operation:'transfer',action:'ALLOW'|'DENY',reason,conditions:[fn]}`
  where `fn = ({params}) => params.amount > CAP`. DENY beats ALLOW.
- Proven: over-cap transfer **DENIED in 2ms, offline, before any RPC**, with
  `.reason` and `.ruleName` populated. Under-cap passed the gate and only failed
  downstream at the bundler — proving the policy was the sole blocker.
- **This is the best live-demo beat:** trigger an over-cap agent spend, watch it
  bounce instantly. Nail this in the pitch.

---

## Files
- `spike1-gasless.mjs` — run: `node spike1-gasless.mjs` (env: BUNDLER_URL, PAYMASTER_URL, PAYMASTER_ADDRESS, PAYMASTER_TOKEN, SEED_PHRASE, RPC_URL)
- `spike2-x402.mjs` — run: `node spike2-x402.mjs` (self-contained, local mock)
- `spike3-policy.mjs` — run: `node spike3-policy.mjs` (self-contained, offline)

## Dependency stack proven present
`@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337`,
`@x402/fetch`, `@x402/evm` (+ `abstractionkit`, `ethers`, `viem` transitively).

## Next actions (in order)
1. Sign up for a free bundler (Pimlico/Candide) + a testnet paymaster/gas policy.
2. Re-run spike1 with those env vars → get a real gasless USDT tx hash on Sepolia.
   That single hash retires the last real risk in the whole pitch.
3. Then build: goal-event → gasless USDT payout to correct predictors, on testnet.
   That end-to-end loop is the July 8 Round-of-16 submission. Guard it.
