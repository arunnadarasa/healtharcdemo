#!/usr/bin/env node
/**
 * Generate NHS-style **artificial HES** CSVs (AE / OP / APC) for demos (e.g. Lovable).
 * Filenames and headers match `scripts/ingest-artificial-hes.mjs` + `server/neighbourhood/hesDb.js`.
 *
 * Env (all optional):
 *   LOVABLE_HES_OUT_DIR — output root (default: examples/lovable-artificial-hes/csv)
 *   LOVABLE_HES_AE_ROWS, LOVABLE_HES_OP_ROWS, LOVABLE_HES_APC_ROWS — counts (defaults: 8000 / 5000 / 4000)
 *
 * Usage:
 *   node scripts/generate-artificial-hes-sample-csv.mjs
 *   LOVABLE_HES_AE_ROWS=50000 node scripts/generate-artificial-hes-sample-csv.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const outRoot =
  process.env.LOVABLE_HES_OUT_DIR?.trim() || path.join(root, 'examples', 'lovable-artificial-hes', 'csv')

const nAe = Math.max(0, parseInt(process.env.LOVABLE_HES_AE_ROWS || '8000', 10) || 8000)
const nOp = Math.max(0, parseInt(process.env.LOVABLE_HES_OP_ROWS || '5000', 10) || 5000)
const nApc = Math.max(0, parseInt(process.env.LOVABLE_HES_APC_ROWS || '4000', 10) || 4000)

/** LSOA11-style codes (synthetic demo geography — not real patient linkage). */
const LSOA_POOL = [
  'E01022770',
  'E01000001',
  'E01010560',
  'E01015649',
  'E01015470',
  'E01026964',
  'E01011365',
  'E01001707',
  'E01006650',
  'E01012229',
  'E01012441',
  'E01005127',
  'E01016785',
  'E01004672',
  'E01012831',
  'E01004278',
  'E01022337',
  'E01000529',
  'E01001256',
  'E01008440',
]

const AE_DISP = ['1', '2', '19', '21', '22']

function pick(arr, i) {
  return arr[i % arr.length]
}

function padPseudo(prefix, n, width = 10) {
  return `${prefix}${String(n).padStart(width, '0')}`
}

function writeAe(filePath, count) {
  const lines = [
    'PSEUDO_HESID,FYEAR,PARTYEAR,LSOA11,ARRIVALAGE,ARRIVALDATE,AEATTENDDISP',
  ]
  for (let i = 0; i < count; i++) {
    const age = 18 + (i % 82)
    const m = 1 + (i % 12)
    const d = 1 + (i % 28)
    const partyear = `2022${String(m).padStart(2, '0')}`
    const date = `2022-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const row = [
      padPseudo('LOVAE', i + 1),
      '202223',
      partyear,
      pick(LSOA_POOL, i),
      String(age),
      date,
      pick(AE_DISP, i),
    ]
    lines.push(row.join(','))
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

function writeOp(filePath, count) {
  const lines = ['PSEUDO_HESID,FYEAR,LSOA11,APPTAGE']
  for (let i = 0; i < count; i++) {
    const age = 20 + (i % 75)
    lines.push(
      [padPseudo('LOVOP', i + 1), '202223', pick(LSOA_POOL, i + 3), String(age)].join(','),
    )
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

function writeApc(filePath, count) {
  const lines = ['PSEUDO_HESID,FYEAR,LSOA11,SPELDUR']
  for (let i = 0; i < count; i++) {
    const dur = 1 + (i % 40)
    lines.push([padPseudo('LOVAP', i + 1), '202223', pick(LSOA_POOL, i + 7), String(dur)].join(','))
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

function main() {
  const aeDir = path.join(outRoot, 'ae')
  const opDir = path.join(outRoot, 'op')
  const apcDir = path.join(outRoot, 'apc')
  for (const d of [aeDir, opDir, apcDir]) {
    fs.mkdirSync(d, { recursive: true })
  }

  const aePath = path.join(aeDir, 'artificial_hes_ae_lovable_sample.csv')
  const opPath = path.join(opDir, 'artificial_hes_op_lovable_sample.csv')
  const apcPath = path.join(apcDir, 'artificial_hes_apc_lovable_sample.csv')

  console.log(`Writing AE=${nAe} OP=${nOp} APC=${nApc} → ${outRoot}`)
  writeAe(aePath, nAe)
  writeOp(opPath, nOp)
  writeApc(apcPath, nApc)
  console.log('Done:', aePath, opPath, apcPath)
}

main()
