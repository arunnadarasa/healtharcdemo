#!/usr/bin/env node
/**
 * Poll Snowstorm GET /imports/:id until the job reaches a terminal state.
 *
 * Usage:
 *   npm run snowstorm:poll-import -- <import-uuid>
 *   SNOWSTORM_URL=http://127.0.0.1:8081 npm run snowstorm:poll-import -- <uuid>
 */
const base = (process.env.SNOWSTORM_URL || 'http://127.0.0.1:8081').replace(/\/$/, '')
const id = process.argv[2]?.trim()

if (!id) {
  console.error('Usage: npm run snowstorm:poll-import -- <import-uuid>')
  console.error('Optional: SNOWSTORM_URL (default http://127.0.0.1:8081)')
  process.exit(1)
}

const url = `${base}/imports/${encodeURIComponent(id)}`
const intervalMs = Number(process.env.SNOWSTORM_POLL_SEC || 30) * 1000

const terminal = new Set([
  'COMPLETE',
  'COMPLETED',
  'DONE',
  'FINISHED',
  'SUCCESS',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'CANCELED',
  'ERROR',
])

function normStatus(body) {
  const s = body && typeof body.status === 'string' ? body.status.trim().toUpperCase() : ''
  return s
}

let lastPrinted = ''

for (;;) {
  let body
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const text = await res.text()
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { raw: text.slice(0, 500), parseError: true }
    }
    if (!res.ok) {
      console.error(new Date().toISOString(), 'HTTP', res.status, JSON.stringify(body).slice(0, 400))
    } else {
      const line = JSON.stringify(body)
      if (line !== lastPrinted) {
        lastPrinted = line
        console.log(new Date().toISOString(), line)
      }
      const st = normStatus(body)
      if (st && terminal.has(st)) {
        if (st === 'FAILED' || st === 'ERROR' || st === 'CANCELLED' || st === 'CANCELED') {
          process.exit(1)
        }
        process.exit(0)
      }
    }
  } catch (e) {
    console.error(new Date().toISOString(), 'fetch error:', e?.message || e)
  }
  await new Promise((r) => setTimeout(r, intervalMs))
}
