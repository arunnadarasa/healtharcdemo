import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createReadStream } from 'node:fs'
import { parseCsvLine } from './hesDb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '..', 'data')

const DATASET_FILE_BY_ID = {
  nhs_qa: 'prepared_generated_data_for_nhs_uk_qa.csv',
  nhs_conversations: 'prepared_generated_data_for_nhs_uk_conversations.csv',
  medical_tasks: 'prepared_generated_data_for_medical_tasks.csv',
}

const CACHE = new Map()

function safeLower(s) {
  return typeof s === 'string' ? s.toLowerCase() : ''
}

function normalizeDataset(dataset) {
  if (dataset === 'nhs_qa' || dataset === 'nhs_conversations' || dataset === 'medical_tasks') return dataset
  return 'nhs_qa'
}

async function loadDatasetRows(datasetId) {
  const fileName = DATASET_FILE_BY_ID[datasetId]
  const filePath = path.join(DATA_DIR, fileName)
  const stat = fs.statSync(filePath)
  const cached = CACHE.get(datasetId)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.rows.length > 0) return cached.rows

  const rows = []
  let header = null
  let textIdx = -1
  let rawIdIdx = -1

  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  for await (const rawLine of rl) {
    if (!rawLine || !rawLine.trim()) continue
    if (!header) {
      header = parseCsvLine(rawLine)
      textIdx = header.indexOf('text')
      rawIdIdx = header.indexOf('raw_data_id')
      continue
    }
    const cols = parseCsvLine(rawLine)
    const text = textIdx >= 0 ? String(cols[textIdx] || '') : ''
    if (!text) continue
    rows.push({
      text,
      rawDataId: rawIdIdx >= 0 ? String(cols[rawIdIdx] || '') : '',
    })
  }

  CACHE.set(datasetId, { mtimeMs: stat.mtimeMs, rows })
  return rows
}

export async function searchNhsUkCsv({
  q,
  dataset,
  mode = 'auto',
  limit = 20,
  offset = 0,
}) {
  const ds = normalizeDataset(dataset)
  const lim = Math.min(100, Math.max(1, Number(limit) || 20))
  const off = Math.max(0, Number(offset) || 0)
  const term = typeof q === 'string' ? q.trim() : ''
  const searchMode = mode === 'prefix' || mode === 'contains' || mode === 'auto' ? mode : 'auto'
  const rows = await loadDatasetRows(ds)

  if (!term) {
    return { dataset: ds, searchMode: 'none', total: rows.length, rows: [] }
  }

  const termLower = safeLower(term)
  const prefixMatches = []
  const containsMatches = []
  for (const row of rows) {
    const textLower = safeLower(row.text)
    if (textLower.startsWith(termLower)) {
      prefixMatches.push(row)
    } else if (textLower.includes(termLower)) {
      containsMatches.push(row)
    }
  }

  let selected = []
  let selectedMode = 'prefix'
  if (searchMode === 'prefix') {
    selected = prefixMatches
  } else if (searchMode === 'contains') {
    selected = [...prefixMatches, ...containsMatches]
    selectedMode = 'contains'
  } else {
    selected = prefixMatches.length > 0 ? prefixMatches : [...prefixMatches, ...containsMatches]
    selectedMode = prefixMatches.length > 0 ? 'prefix' : 'contains'
  }

  const sliced = selected.slice(off, off + lim).map((row) => ({
    rawDataId: row.rawDataId,
    text: row.text,
  }))
  return {
    dataset: ds,
    searchMode: selectedMode,
    total: selected.length,
    rows: sliced,
  }
}
