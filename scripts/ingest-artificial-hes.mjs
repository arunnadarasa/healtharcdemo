#!/usr/bin/env node
/**
 * Ingest NHS artificial HES AE sample CSVs into SQLite (data/neighbourhood-hes.db).
 * Set HES_SAMPLE_DIR to the folder containing artificial_hes_ae_*_sample subfolders, or pass paths as args.
 *
 * Example:
 *   HES_SAMPLE_DIR="$HOME/Downloads/artificial_hes_ae_202302_v1_sample" node scripts/ingest-artificial-hes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearAe, ingestAeFile } from '../server/neighbourhood/hesDb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function findAeCsvs(root) {
  const out = []
  if (!fs.existsSync(root)) return out
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else if (/^artificial_hes_ae.*\.csv$/i.test(name)) out.push(p)
    }
  }
  walk(root)
  return out.sort()
}

const args = process.argv.slice(2)
let dirs = args.length > 0 ? args : []

if (dirs.length === 0) {
  const env = process.env.HES_SAMPLE_DIR?.trim()
  if (env) dirs = [env]
  else {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    dirs = [
      path.join(home, 'Downloads', 'artificial_hes_ae_202302_v1_sample'),
      path.join(__dirname, '..', 'samples', 'artificial_hes_ae'),
    ]
  }
}

let total = 0
clearAe()
for (const dir of dirs) {
  const csvs = findAeCsvs(dir)
  if (csvs.length === 0) {
    console.warn(`No artificial_hes_ae*.csv under: ${dir}`)
    continue
  }
  for (const f of csvs) {
    const r = ingestAeFile(f)
    console.log(`${path.basename(f)}: +${r.inserted} rows`)
    total += r.inserted
  }
}

console.log(`Done. Total AE rows inserted: ${total}`)
console.log('Note: Artificial HES does not preserve relational integrity; demo only.')
