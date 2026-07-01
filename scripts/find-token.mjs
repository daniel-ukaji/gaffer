// Discover which ERC-20 token(s) the treasury just received (e.g. from a faucet),
// and print address + symbol + decimals + balance. No explorer key needed.
//
//   node scripts/find-token.mjs [treasuryAddress]

import { JsonRpcProvider, Contract, id, getAddress, zeroPadValue } from 'ethers'

const RPC = process.env.RPC_URL || 'https://sepolia.drpc.org'
const TREASURY = process.argv[2] || process.env.TREASURY || '0x97682ff1A980a96D65Ea606b717441E3662c557E'
const provider = new JsonRpcProvider(RPC)

const ERC20 = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)']

const latest = await provider.getBlockNumber()
const from = Math.max(0, latest - 8000) // faucet claim is very recent
const transferTopic = id('Transfer(address,address,uint256)')
const toTopic = zeroPadValue(getAddress(TREASURY), 32)

console.log(`Scanning blocks ${from}..${latest} for ERC-20 transfers into ${TREASURY} …`)
let logs = []
try {
  logs = await provider.getLogs({ fromBlock: from, toBlock: latest, topics: [transferTopic, null, toTopic] })
} catch (e) {
  console.log('log scan failed (RPC limit?). Try a smaller range or set RPC_URL. ' + e.message)
  process.exit(1)
}

const tokens = [...new Set(logs.map((l) => getAddress(l.address)))]
if (!tokens.length) {
  console.log('No incoming ERC-20 transfers found in range. Claim from the faucet first, then re-run.')
  process.exit(0)
}

for (const addr of tokens) {
  const c = new Contract(addr, ERC20, provider)
  const [sym, dec, bal] = await Promise.all([c.symbol().catch(() => '?'), c.decimals().catch(() => 18), c.balanceOf(TREASURY).catch(() => 0n)])
  const human = Number(bal) / 10 ** Number(dec)
  console.log(`\n  TOKEN=${addr}`)
  console.log(`  symbol=${sym}  decimals=${dec}  balance=${human} ${sym}`)
}
console.log('\nUse the TOKEN=... line above in .env (pick the test USD₮ one).')
