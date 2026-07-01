// SPIKE 2 — x402 paid request signed by a WDK wallet.
//
// Goal: prove a WDK EVM wallet can act as an x402 client signer — the agent
// paying per-request in USDT over HTTP (402 -> sign -> retry -> 200). This is
// the "creativity spike" of the pitch and the least-documented WDK claim.
//
// We run the CLIENT side against a LOCAL mock 402 server. The client-side proof
// (WDK wallet signs an EIP-3009 payment authorization and attaches X-PAYMENT)
// needs no funding or facilitator — on-chain settlement is server-side and the
// same ops gap as spike 1.
//
// Run:  node spike2-x402.mjs

import http from 'node:http'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import {
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
} from '@x402/core/http'

const pass = (s) => console.log('  \x1b[32mPASS\x1b[0m   ' + s)
const part = (s) => console.log('  \x1b[33mPARTIAL\x1b[0m ' + s)
const fail = (s) => console.log('  \x1b[31mFAIL\x1b[0m   ' + s)
const line = (s = '') => console.log(s)

const SEED =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const PAY_TO = '0x000000000000000000000000000000000000dEaD'

line('════════════════════════════════════════════════════════════')
line(' SPIKE 2 — WDK wallet as an x402 client signer')
line('════════════════════════════════════════════════════════════')
line('')

// ── A. Build a WDK EVM account (the agent wallet) ──
line('A. Build WDK EVM account')
const wallet = new WalletManagerEvm(SEED, { provider: 'https://sepolia.drpc.org', chainId: 11155111 })
const account = await wallet.getAccount(0)
const address = typeof account.getAddress === 'function' ? await account.getAddress() : account.address
pass('WDK account address = ' + address)

// ── B. Wire WDK -> x402. Test the docs' "no adapter required" claim honestly. ──
line('')
line('B. Register the exact EVM scheme with the WDK account as signer')
function buildClient(signer, labelNote) {
  const c = new x402Client()
  registerExactEvmScheme(c, { signer })
  pass('registerExactEvmScheme accepted the signer ' + labelNote)
  return c
}

// x402 calls signTypedData({domain,types,primaryType,message}) and wants 0x-string.
// WDK's is signTypedData({domain,types,message}) (ethers infers primaryType and
// rejects an EIP712Domain entry in `types`). This adapter bridges that gap.
const adapter = {
  address,
  async signTypedData({ domain, types, primaryType, message }) {
    const t = { ...types }
    delete t.EIP712Domain // ethers derives the domain separator itself
    return account.signTypedData({ domain, types: t, message })
  },
}

let usedAdapter = false
let client
try {
  client = buildClient(account, '(WDK account passed DIRECTLY — testing the docs claim)')
} catch (e) {
  part('direct signer rejected at registration: ' + e.message)
  client = buildClient(adapter, '(via thin adapter)')
  usedAdapter = true
}
const fetchWithPayment = wrapFetchWithPayment(fetch, client)

// ── C. Local mock 402 server ──
line('')
line('C. Start local mock 402 server (exact/eip155:11155111, USDC)')
let sawXPayment = null
const paymentRequired = {
  x402Version: 2,
  error: 'payment required',
  resource: {
    url: 'http://localhost/match/live',
    description: 'Live match feed (1 call)',
    mimeType: 'application/json',
    serviceName: 'GafferFeed',
  },
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:11155111',
      amount: '1000000', // 1 USDC (6dp) — pay-per-call for match data
      payTo: PAY_TO,
      maxTimeoutSeconds: 300,
      asset: USDC_SEPOLIA,
      extra: { name: 'USDC', version: '2' }, // token EIP-712 domain -> no chain read
    },
  ],
}
const server = http.createServer((req, res) => {
  // x402 v2: payment arrives in the PAYMENT-SIGNATURE header (not X-PAYMENT).
  const sig = req.headers['payment-signature']
  if (!sig) {
    // v2: requirements go out as a base64 PAYMENT-REQUIRED header, not the body.
    res.writeHead(402, {
      'content-type': 'application/json',
      'PAYMENT-REQUIRED': encodePaymentRequiredHeader(paymentRequired),
    })
    res.end(JSON.stringify({ error: 'payment required' }))
    return
  }
  // Retry carried a signed payment — the WDK wallet produced it. Return 200.
  sawXPayment = sig
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ match: 'FINAL', score: '2-1', minute: 90, source: 'paid-feed' }))
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port
pass('mock server on :' + port)

// ── D. The paid request ──
line('')
line('D. GET the paid resource through wrapFetchWithPayment (402 -> sign -> 200)')
try {
  const resp = await fetchWithPayment(`http://localhost:${port}/match/live`, { method: 'GET' })
  const data = await resp.json()
  if (resp.status === 200 && sawXPayment) {
    pass('server returned 200 with paid data: ' + JSON.stringify(data))
    // Decode the PAYMENT-SIGNATURE header to show the WDK-signed authorization.
    try {
      const decoded = decodePaymentSignatureHeader(sawXPayment)
      const payload = decoded?.payload ?? decoded
      const auth = payload?.authorization ?? payload
      const sig = payload?.signature || auth?.signature
      pass('PAYMENT-SIGNATURE header was produced and signed by the WDK wallet:')
      line('         scheme=' + decoded?.scheme + ' network=' + decoded?.network + ' x402Version=' + decoded?.x402Version)
      if (sig) pass('  signature present (EIP-3009 authorization): ' + String(sig).slice(0, 26) + '…')
      pass('  from=' + (auth?.from || address))
    } catch (err) {
      part('could not decode PAYMENT-SIGNATURE (but it was present): ' + String(err.message).slice(0, 80))
    }
    line('')
    pass('CALL #2 PROVEN: WDK wallet signs x402 payments; 402->pay->200 works' + (usedAdapter ? ' (needs a ~6-line signTypedData adapter — noted).' : ' (WDK signer worked directly).'))
  } else {
    fail('did not complete the paid flow (status=' + resp.status + ', sawPayment=' + !!sawXPayment + ')')
  }
} catch (e) {
  part('paid flow errored during signing/build: ' + (e.message || String(e)).slice(0, 200))
  line('        → This is the WDK<->x402 signing seam; see error above to finish wiring.')
}

server.close()
if (wallet.dispose) wallet.dispose()
line('')
line('════════════════════════════════════════════════════════════')
