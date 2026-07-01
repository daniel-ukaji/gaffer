// Gaffer — x402 paid match data.
//
// WDK's flagship novelty: an autonomous agent that pays PER REQUEST in USDT over
// HTTP. Here the agent buys live match data (a pre-match preview, the official
// result) from a paywalled service, signing an EIP-3009 payment with its own
// wallet — no cards, no accounts, no human in the loop.
//
// Two halves:
//   createDataAgent()            — the agent's payer: a WDK wallet wrapped as an
//                                  x402 client. `buy(url)` runs 402 → sign → 200.
//   startPaidMatchDataService()  — a local x402-paywalled data service (the thing
//                                  a real feed provider would run) for a
//                                  self-contained, reproducible demo.
//
// The WDK wallet satisfies x402's ClientEvmSigner directly (no adapter) — proven
// in spike/spike2-x402.mjs. On-chain settlement of the signed payment is the
// facilitator's job (same external boundary as the payout's paymaster); the
// client-side "agent signs and pays per request" is fully real here.

import http from 'node:http'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader } from '@x402/core/http'

/**
 * The agent's data-purchasing wallet, wrapped as an x402 payer.
 * @param {{ seed: string, provider: string, chainId: number }} cfg
 */
export async function createDataAgent({ seed, provider, chainId }) {
  const wallet = new WalletManagerEvm(seed, { provider, chainId })
  const account = await wallet.getAccount(0)
  const address = typeof account.getAddress === 'function' ? await account.getAddress() : account.address

  const client = new x402Client()
  registerExactEvmScheme(client, { signer: account }) // WDK account IS the signer
  const fetchWithPayment = wrapFetchWithPayment(fetch, client)

  return {
    address,
    /** GET a paywalled resource, paying per x402 (402 → sign → 200). */
    async buy(url) {
      const res = await fetchWithPayment(url, { method: 'GET' })
      const data = await res.json().catch(() => null)
      return { status: res.status, data }
    },
    dispose: () => wallet.dispose?.(),
  }
}

/**
 * A local x402-paywalled match-data service (x402 v2: requirements in the
 * PAYMENT-REQUIRED header, payment in PAYMENT-SIGNATURE).
 *
 * @param {object} cfg
 * @param {number} [cfg.port=0]
 * @param {number} cfg.chainId
 * @param {string} cfg.payTo   - where payments settle
 * @param {string} cfg.asset   - payment token address
 * @param {string} [cfg.priceMicros='10000'] - price per call in base units (0.01 @ 6dp)
 * @param {Record<string, { description: string, body: any }>} cfg.resources - path -> data
 * @returns {Promise<{ url: string, port: number, payments: any[], close: () => Promise<void> }>}
 */
export async function startPaidMatchDataService({ port = 0, chainId, payTo, asset, priceMicros = '10000', resources }) {
  const payments = []
  const server = http.createServer((req, res) => {
    const path = (req.url || '').split('?')[0]
    const resource = resources[path]
    if (!resource) {
      res.writeHead(404, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'no such resource' }))
    }

    const sig = req.headers['payment-signature']
    if (!sig) {
      const required = {
        x402Version: 2,
        error: 'payment required',
        resource: { url: `http://localhost${path}`, description: resource.description, mimeType: 'application/json', serviceName: 'GafferFeed' },
        accepts: [
          {
            scheme: 'exact',
            network: `eip155:${chainId}`,
            amount: priceMicros,
            payTo,
            maxTimeoutSeconds: 300,
            asset,
            extra: { name: 'USD₮', version: '1' }, // EIP-712 domain for the client to sign
          },
        ],
      }
      res.writeHead(402, { 'content-type': 'application/json', 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required) })
      return res.end(JSON.stringify({ error: 'payment required' }))
    }

    // Payment present — the agent signed it. Record who paid, then serve the data.
    try {
      const decoded = decodePaymentSignatureHeader(sig)
      const auth = decoded?.payload?.authorization ?? decoded?.payload ?? {}
      payments.push({ path, from: auth.from, amount: priceMicros, scheme: decoded?.scheme, network: decoded?.network })
    } catch {
      payments.push({ path, from: undefined, amount: priceMicros })
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(resource.body))
  })

  await new Promise((r) => server.listen(port, r))
  const actualPort = server.address().port
  return {
    url: `http://localhost:${actualPort}`,
    port: actualPort,
    payments,
    close: () => new Promise((r) => server.close(r)),
  }
}
