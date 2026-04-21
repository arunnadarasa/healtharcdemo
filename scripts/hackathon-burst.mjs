#!/usr/bin/env node
/**
 * Fire many unpaid neighbourhood insight requests (for tx count when NHS_ENABLE_PAYMENT_GATE=false).
 * Or use with a real x402 client — this script only hits the free path when payment gate is off.
 *
 *   NHS_ENABLE_PAYMENT_GATE=false node scripts/hackathon-burst.mjs
 */
const base = process.env.BURST_API_BASE || 'http://127.0.0.1:8787'
const n = Number(process.env.BURST_COUNT || '50')

async function main() {
  let ok = 0
  for (let i = 0; i < n; i++) {
    const res = await fetch(`${base}/api/neighbourhood/insights/lsoa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) ok++
    if ((i + 1) % 10 === 0) process.stdout.write(`… ${i + 1}/${n}\n`)
  }
  console.log(`Finished ${n} POSTs; ${ok} HTTP OK (requires payment gate off for unpaid success).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
