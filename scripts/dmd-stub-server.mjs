#!/usr/bin/env node
/**
 * Minimal wardle/dmd-shaped HTTP server for local demos when real TRUD + dmd.db
 * is not installed. Serves LOVABLE_DMD_DEMO_ITEMS names only (exact match per request string).
 *
 * Usage: node scripts/dmd-stub-server.mjs
 * Env: PORT or DMD_STUB_PORT (default 8082)
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const demoPath = path.join(__dirname, '..', 'docs', 'LOVABLE_DMD_DEMO_ITEMS.json')
const demo = JSON.parse(fs.readFileSync(demoPath, 'utf8'))
const items = demo.items

/** Same shape as wardle `GET /dmd/v1/lookup/BASIS_OF_NAME` (subset). */
const LOOKUP_BASIS_OF_NAME = [
  { CD: 1, DESC: 'rINN - Recommended International Non-proprietary' },
  { CD: 2, DESC: 'BAN - British Approved Name' },
  { CD: 3, DESC: 'BANM - British Approved Name (Modified)' },
]

function findItemBySearchString(s) {
  const t = typeof s === 'string' ? s.trim() : ''
  if (!t) return null
  const lower = t.toLowerCase()
  return (
    items.find((it) => it.q.toLowerCase() === lower) ||
    items.find((it) => it.label.toLowerCase() === lower) ||
    null
  )
}

function stubProductForItem(item, idx) {
  const id = 777067000000 + idx * 1000
  return {
    ID: id,
    NM: `${item.label} (demo stub — not NHS dm+d)`,
    TYPE: 'VTM',
    VTMID: 108537001,
    BNF_DETAILS: { BNF: 'demo', ATC: 'demo', VPID: id },
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return
  }
  let u
  try {
    u = new URL(req.url || '/', 'http://127.0.0.1')
  } catch {
    res.statusCode = 400
    res.end()
    return
  }
  const pathname = u.pathname.replace(/\/$/, '') || u.pathname
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (pathname === '/dmd/v1/lookup/BASIS_OF_NAME') {
    res.statusCode = 200
    res.end(JSON.stringify(LOOKUP_BASIS_OF_NAME))
    return
  }

  if (pathname.startsWith('/dmd/v1/product/')) {
    const code = decodeURIComponent(pathname.slice('/dmd/v1/product/'.length))
    const idxBySynthetic = items.findIndex((_, i) => String(777067000000 + i * 1000) === code)
    if (idxBySynthetic >= 0) {
      res.statusCode = 200
      res.end(JSON.stringify(stubProductForItem(items[idxBySynthetic], idxBySynthetic)))
      return
    }
    if (/^\d+$/.test(code)) {
      res.statusCode = 200
      res.end(
        JSON.stringify({
          ID: Number(code),
          NM: `Product ${code} (demo stub — not NHS dm+d)`,
          TYPE: 'VMP',
        }),
      )
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
    return
  }

  if (pathname === '/dmd/v1/search') {
    const s = u.searchParams.get('s') || ''
    const item = findItemBySearchString(s)
    if (!item) {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'no exact match (stub only knows LOVABLE demo names)', s }))
      return
    }
    const idx = items.indexOf(item)
    res.statusCode = 200
    res.end(JSON.stringify(stubProductForItem(item, idx)))
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ error: 'unknown path', pathname }))
})

const PORT = Number(process.env.PORT || process.env.DMD_STUB_PORT || 8082)
server.listen(PORT, () => {
  console.error(`[dmd-stub] listening on http://127.0.0.1:${PORT} (demo data only; not wardle/dmd)`)
})
