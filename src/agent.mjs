// Gaffer — the autonomous treasury agent.
//
// Wraps the WDK orchestrator: a gasless ERC-4337 Safe smart account (the crew
// treasury) governed by a spending MANDATE expressed as WDK transaction
// policies. The agent settles payouts on its own, but the policy layer means it
// *cannot* exceed its mandate — the guardrail is enforced pre-broadcast, offline.
//
// Two mandate rules (both proven in the spike):
//   1. per-payout cap  — no single transfer may exceed a limit
//   2. session budget  — cumulative payouts may not exceed a total for the match
//
// Gas is sponsored (paymaster pays), so the treasury never needs native ETH and
// a fan never sees "gas". The treasury only ever holds USDT.

import WDK from '@tetherto/wdk'
import { PolicyViolationError } from '@tetherto/wdk'
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'

const WALLET = 'treasury'

export { PolicyViolationError }

export class GafferAgent {
  /**
   * @param {object} cfg
   * @param {string} cfg.seed - BIP-39 seed for the treasury.
   * @param {number} cfg.chainId
   * @param {string} cfg.provider - RPC url.
   * @param {string} cfg.bundlerUrl
   * @param {string} cfg.paymasterUrl
   * @param {string} [cfg.sponsorshipPolicyId]
   * @param {string} cfg.token - USDT/USDC address (payout token).
   * @param {object} cfg.mandate
   * @param {bigint} cfg.mandate.perPayoutCap - Max single payout (base units).
   * @param {bigint} cfg.mandate.sessionCap  - Max cumulative payouts (base units).
   */
  constructor(cfg) {
    this.token = cfg.token
    this.mandate = cfg.mandate
    this._spent = 0n // cumulative confirmed spend this session

    this.wdk = new WDK(cfg.seed).registerWallet(WALLET, WalletManagerEvmErc4337, {
      chainId: cfg.chainId,
      provider: cfg.provider,
      bundlerUrl: cfg.bundlerUrl,
      safeModulesVersion: '0.3.0',
      isSponsored: true,
      paymasterUrl: cfg.paymasterUrl,
      ...(cfg.sponsorshipPolicyId ? { sponsorshipPolicyId: cfg.sponsorshipPolicyId } : {}),
    })

    this.wdk.registerPolicy({
      id: 'gaffer-mandate',
      name: 'Gaffer treasury mandate',
      scope: 'account',
      wallet: WALLET,
      accounts: [0],
      rules: [
        { name: 'allow-payouts', operation: 'transfer', action: 'ALLOW', conditions: [() => true] },
        {
          name: 'deny-over-per-payout',
          operation: 'transfer',
          action: 'DENY',
          reason: `Single payout exceeds per-payout cap (${this.mandate.perPayoutCap})`,
          conditions: [({ params }) => isBig(params?.amount) && params.amount > this.mandate.perPayoutCap],
        },
        {
          name: 'deny-over-session-budget',
          operation: 'transfer',
          action: 'DENY',
          reason: `Payout would exceed the session budget (${this.mandate.sessionCap})`,
          conditions: [({ params }) => isBig(params?.amount) && this._spent + params.amount > this.mandate.sessionCap],
        },
      ],
    })
  }

  /** Resolve the policy-wrapped treasury account (Proxy that enforces the mandate). */
  async account() {
    if (!this._account) this._account = await this.wdk.getAccount(WALLET, 0)
    return this._account
  }

  /** The treasury smart-account address (deterministic Safe address). */
  async address() {
    const a = await this.account()
    return typeof a.getAddress === 'function' ? await a.getAddress() : a.address
  }

  /** Treasury balance of the payout token (base units). */
  async tokenBalance() {
    const a = await this.account()
    return a.getTokenBalance(this.token)
  }

  /** Record a confirmed spend so the session-budget rule stays accurate. */
  recordSpend(amount) {
    this._spent += amount
  }

  get spent() {
    return this._spent
  }

  dispose() {
    this.wdk.dispose?.()
  }
}

const isBig = (v) => typeof v === 'bigint'
