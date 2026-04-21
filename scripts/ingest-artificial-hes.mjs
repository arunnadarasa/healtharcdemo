#!/usr/bin/env node
/**
 * Stream-ingest NHS artificial HES CSVs (AE / OP / APC) into SQLite.
 *
 * Env:
 *   HES_AE_DIR, HES_OP_DIR, HES_APC_DIR — directories (recursively scanned for *.csv)
 *   HES_SAMPLE_DIR — legacy: AE-only root (if AE dir not set)
 *   HES_ROW_LIMIT_PER_FILE — max rows per file (default: unlimited)
 *   HES_CLEAR_FIRST=1 — DELETE existing rows per dataset before ingest
 *
 * Example:
 *   HES_AE_DIR="$HOME/Downloads/artificial_hes_ae_202302_v1_full/artificial_hes_ae_202302_v1_full" \
 *   HES_OP_DIR="$HOME/Downloads/artificial_hes_op_202302_v1_full/artificial_hes_op_202302_v1_full" \
 *   HES_APC_DIR="$HOME/Downloads/artificial_hes_apc_202302_v1_full/artificial_hes_apc_202302_v1_full" \
 *   HES_ROW_LIMIT_PER_FILE=50000 node scripts/ingest-artificial-hes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clearAllHes,
  getHesDb,
  ingestAeFileStreaming,
  ingestApcFileStreaming,
  ingestOpFileStreaming,
  setIngestMeta,
} from '../server/neighbourhood/hesDb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function findCsvs(root, pattern) {
  const out = []
  if (!fs.existsSync(root)) return out
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name)
      let st
      try {
        st = fs.statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p)
      else if (pattern.test(name)) out.push(p)
    }
  }
  walk(root)
  return out.sort()
}

const rowLimit = (() => {
  const v = process.env.HES_ROW_LIMIT_PER_FILE?.trim()
  if (!v) return Number.POSITIVE_INFINITY
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY
})()

const batchSize = (() => {
  const v = process.env.HES_INGEST_BATCH?.trim()
  if (!v) return 5000
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : 5000
})()

const home = process.env.HOME || process.env.USERPROFILE || ''

const aeDir =
  process.env.HES_AE_DIR?.trim() ||
  process.env.HES_SAMPLE_DIR?.trim() ||
  path.join(home, 'Downloads', 'artificial_hes_ae_202302_v1_sample')
const opDir = process.env.HES_OP_DIR?.trim() || ''
const apcDir = process.env.HES_APC_DIR?.trim() || ''

const clearFirst = process.env.HES_CLEAR_FIRST === '1' || process.env.HES_CLEAR_FIRST === 'true'

async function main() {
  const db = getHesDb()
  if (process.env.HES_BULK_PRAGMAS !== '0') {
    try {
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = NORMAL')
    } catch {
      /* ignore */
    }
  }

  const started = new Date().toISOString()
  setIngestMeta('last_ingest_started', started, db)

  let totalAe = 0
  let totalOp = 0
  let totalApc = 0

  if (clearFirst) {
    console.warn('HES_CLEAR_FIRST: clearing AE / OP / APC tables + FTS')
    clearAllHes(db)
  } else {
    console.warn('Note: appending to existing DB. Set HES_CLEAR_FIRST=1 for a clean load.')
  }

  const aeCsvs = findCsvs(aeDir, /^artificial_hes_ae.*\.csv$/i)
  for (const f of aeCsvs) {
    const r = await ingestAeFileStreaming(f, db, { rowLimit, batchSize })
    console.log(`AE ${path.basename(f)}: +${r.inserted} rows`)
    totalAe += r.inserted
  }
  if (!aeCsvs.length) console.warn(`No AE CSVs under: ${aeDir}`)

  if (opDir) {
    const opCsvs = findCsvs(opDir, /^artificial_hes_op.*\.csv$/i)
    for (const f of opCsvs) {
      const r = await ingestOpFileStreaming(f, db, { rowLimit, batchSize })
      console.log(`OP ${path.basename(f)}: +${r.inserted} rows`)
      totalOp += r.inserted
    }
    if (!opCsvs.length) console.warn(`No OP CSVs under: ${opDir}`)
  }

  if (apcDir) {
    const apcCsvs = findCsvs(apcDir, /^artificial_hes_apc.*\.csv$/i)
    for (const f of apcCsvs) {
      const r = await ingestApcFileStreaming(f, db, { rowLimit, batchSize })
      console.log(`APC ${path.basename(f)}: +${r.inserted} rows`)
      totalApc += r.inserted
    }
    if (!apcCsvs.length) console.warn(`No APC CSVs under: ${apcDir}`)
  }

  const finished = new Date().toISOString()
  setIngestMeta('last_ingest_finished', finished, db)
  setIngestMeta(
    'last_ingest_totals',
    JSON.stringify({ ae: totalAe, op: totalOp, apc: totalApc, aeDir, opDir, apcDir }),
    db,
  )

  console.log(`Done. AE=${totalAe} OP=${totalOp} APC=${totalApc}`)
  console.log('Note: Artificial HES does not preserve relational integrity; demo only.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
