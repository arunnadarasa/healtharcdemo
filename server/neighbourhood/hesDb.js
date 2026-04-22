/**
 * SQLite store for artificial HES rows (AE / OP / APC) — streaming ingest, FTS5, aggregates.
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createReadStream } from 'node:fs'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function defaultDbPath() {
  const root = path.join(__dirname, '..', '..', 'data')
  try {
    fs.mkdirSync(root, { recursive: true })
  } catch {
    /* ignore */
  }
  return path.join(root, 'neighbourhood-hes.db')
}

let _db

function migrateFtsAndMeta(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hes_ingest_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS hes_fts USING fts5(
      lsoa,
      pseudo_hes_id,
      dataset UNINDEXED,
      src_rowid UNINDEXED,
      tokenize = 'unicode61'
    );
  `)
}

export function getHesDb() {
  if (_db) return _db
  const dbPath = process.env.HES_SQLITE_PATH?.trim() || defaultDbPath()
  _db = new Database(dbPath)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS hes_ae (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo_hes_id TEXT,
      fyear TEXT,
      partyear TEXT,
      lsoa TEXT,
      arrival_age REAL,
      arrival_date TEXT,
      ae_disp TEXT,
      source_file TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hes_ae_lsoa ON hes_ae(lsoa);
    CREATE TABLE IF NOT EXISTS hes_op (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo_hes_id TEXT,
      fyear TEXT,
      lsoa TEXT,
      appt_age REAL,
      source_file TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hes_op_lsoa ON hes_op(lsoa);
    CREATE TABLE IF NOT EXISTS hes_apc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo_hes_id TEXT,
      fyear TEXT,
      lsoa TEXT,
      spell_duration REAL,
      source_file TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hes_apc_lsoa ON hes_apc(lsoa);
  `)
  migrateFtsAndMeta(_db)
  return _db
}

/** @param {string} line */
export function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += c
    }
  }
  result.push(current)
  return result
}

function colIndex(header, name) {
  const i = header.indexOf(name)
  return i >= 0 ? i : -1
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * @param {string} filePath
 * @param {import('better-sqlite3').Database} db
 * @param {{ rowLimit?: number, batchSize?: number }} opts
 */
export async function ingestAeFileStreaming(filePath, db = getHesDb(), opts = {}) {
  const rowLimit = opts.rowLimit ?? Number.POSITIVE_INFINITY
  const batchSize = opts.batchSize ?? 5000
  const insert = db.prepare(
    `INSERT INTO hes_ae (pseudo_hes_id, fyear, partyear, lsoa, arrival_age, arrival_date, ae_disp, source_file)
     VALUES (@pseudo_hes_id, @fyear, @partyear, @lsoa, @arrival_age, @arrival_date, @ae_disp, @source_file)`,
  )
  const insertFts = db.prepare(
    `INSERT INTO hes_fts (lsoa, pseudo_hes_id, dataset, src_rowid) VALUES (@lsoa, @pseudo_hes_id, 'ae', @src_rowid)`,
  )

  let header = null
  let inserted = 0
  let batch = []

  const flush = db.transaction((rows) => {
    for (const rec of rows) {
      const r = insert.run(rec)
      insertFts.run({
        lsoa: rec.lsoa || '',
        pseudo_hes_id: rec.pseudo_hes_id || '',
        src_rowid: r.lastInsertRowid,
      })
      inserted++
    }
  })

  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  for await (const rawLine of rl) {
    const line = stripBom(rawLine)
    if (!line.length) continue
    if (!header) {
      header = parseCsvLine(line)
      continue
    }
    if (inserted >= rowLimit) break
    const row = parseCsvLine(line)
    if (row.length < header.length * 0.5) continue
    const iPse = colIndex(header, 'PSEUDO_HESID')
    const iFy = colIndex(header, 'FYEAR')
    const iPy = colIndex(header, 'PARTYEAR')
    const iLsoa = colIndex(header, 'LSOA01') >= 0 ? colIndex(header, 'LSOA01') : colIndex(header, 'LSOA11')
    const iAge = colIndex(header, 'ARRIVALAGE')
    const iDate = colIndex(header, 'ARRIVALDATE')
    const iDisp = colIndex(header, 'AEATTENDDISP')
    if (inserted + batch.length >= rowLimit) break
    batch.push({
      pseudo_hes_id: iPse >= 0 ? row[iPse] ?? '' : '',
      fyear: iFy >= 0 ? row[iFy] ?? '' : '',
      partyear: iPy >= 0 ? row[iPy] ?? '' : '',
      lsoa: iLsoa >= 0 ? row[iLsoa] ?? '' : '',
      arrival_age: iAge >= 0 ? Number.parseFloat(row[iAge] || '0') : null,
      arrival_date: iDate >= 0 ? row[iDate] ?? '' : '',
      ae_disp: iDisp >= 0 ? row[iDisp] ?? '' : '',
      source_file: path.basename(filePath),
    })
    if (batch.length >= batchSize) {
      flush(batch)
      batch = []
    }
    if (inserted >= rowLimit) break
  }
  if (batch.length && inserted < rowLimit) {
    const room = rowLimit - inserted
    flush(batch.slice(0, room))
  }
  return { inserted }
}

/**
 * @param {string} filePath
 * @param {import('better-sqlite3').Database} db
 * @param {{ rowLimit?: number, batchSize?: number }} opts
 */
export async function ingestOpFileStreaming(filePath, db = getHesDb(), opts = {}) {
  const rowLimit = opts.rowLimit ?? Number.POSITIVE_INFINITY
  const batchSize = opts.batchSize ?? 5000
  const insert = db.prepare(
    `INSERT INTO hes_op (pseudo_hes_id, fyear, lsoa, appt_age, source_file)
     VALUES (@pseudo_hes_id, @fyear, @lsoa, @appt_age, @source_file)`,
  )
  const insertFts = db.prepare(
    `INSERT INTO hes_fts (lsoa, pseudo_hes_id, dataset, src_rowid) VALUES (@lsoa, @pseudo_hes_id, 'op', @src_rowid)`,
  )

  let header = null
  let inserted = 0
  let batch = []

  const flush = db.transaction((rows) => {
    for (const rec of rows) {
      const r = insert.run(rec)
      insertFts.run({
        lsoa: rec.lsoa || '',
        pseudo_hes_id: rec.pseudo_hes_id || '',
        src_rowid: r.lastInsertRowid,
      })
      inserted++
    }
  })

  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  for await (const rawLine of rl) {
    const line = stripBom(rawLine)
    if (!line.length) continue
    if (!header) {
      header = parseCsvLine(line)
      continue
    }
    if (inserted >= rowLimit) break
    const row = parseCsvLine(line)
    if (row.length < header.length * 0.5) continue
    const iPse = colIndex(header, 'PSEUDO_HESID')
    const iFy = colIndex(header, 'FYEAR')
    const iLsoa = colIndex(header, 'LSOA01') >= 0 ? colIndex(header, 'LSOA01') : colIndex(header, 'LSOA11')
    const iAge = colIndex(header, 'APPTAGE')
    if (inserted + batch.length >= rowLimit) break
    batch.push({
      pseudo_hes_id: iPse >= 0 ? row[iPse] ?? '' : '',
      fyear: iFy >= 0 ? row[iFy] ?? '' : '',
      lsoa: iLsoa >= 0 ? row[iLsoa] ?? '' : '',
      appt_age: iAge >= 0 ? Number.parseFloat(row[iAge] || '0') : null,
      source_file: path.basename(filePath),
    })
    if (batch.length >= batchSize) {
      flush(batch)
      batch = []
    }
    if (inserted >= rowLimit) break
  }
  if (batch.length && inserted < rowLimit) {
    const room = rowLimit - inserted
    flush(batch.slice(0, room))
  }
  return { inserted }
}

/**
 * @param {string} filePath
 * @param {import('better-sqlite3').Database} db
 * @param {{ rowLimit?: number, batchSize?: number }} opts
 */
export async function ingestApcFileStreaming(filePath, db = getHesDb(), opts = {}) {
  const rowLimit = opts.rowLimit ?? Number.POSITIVE_INFINITY
  const batchSize = opts.batchSize ?? 5000
  const insert = db.prepare(
    `INSERT INTO hes_apc (pseudo_hes_id, fyear, lsoa, spell_duration, source_file)
     VALUES (@pseudo_hes_id, @fyear, @lsoa, @spell_duration, @source_file)`,
  )
  const insertFts = db.prepare(
    `INSERT INTO hes_fts (lsoa, pseudo_hes_id, dataset, src_rowid) VALUES (@lsoa, @pseudo_hes_id, 'apc', @src_rowid)`,
  )

  let header = null
  let inserted = 0
  let batch = []

  const flush = db.transaction((rows) => {
    for (const rec of rows) {
      const r = insert.run(rec)
      insertFts.run({
        lsoa: rec.lsoa || '',
        pseudo_hes_id: rec.pseudo_hes_id || '',
        src_rowid: r.lastInsertRowid,
      })
      inserted++
    }
  })

  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  for await (const rawLine of rl) {
    const line = stripBom(rawLine)
    if (!line.length) continue
    if (!header) {
      header = parseCsvLine(line)
      continue
    }
    if (inserted >= rowLimit) break
    const row = parseCsvLine(line)
    if (row.length < header.length * 0.5) continue
    const iPse = colIndex(header, 'PSEUDO_HESID')
    const iFy = colIndex(header, 'FYEAR')
    const iLsoa = colIndex(header, 'LSOA01') >= 0 ? colIndex(header, 'LSOA01') : colIndex(header, 'LSOA11')
    const iDur =
      colIndex(header, 'SPELDUR') >= 0
        ? colIndex(header, 'SPELDUR')
        : colIndex(header, 'SPELDUR_CALC')
    if (inserted + batch.length >= rowLimit) break
    batch.push({
      pseudo_hes_id: iPse >= 0 ? row[iPse] ?? '' : '',
      fyear: iFy >= 0 ? row[iFy] ?? '' : '',
      lsoa: iLsoa >= 0 ? row[iLsoa] ?? '' : '',
      spell_duration: iDur >= 0 ? Number.parseFloat(row[iDur] || '0') : null,
      source_file: path.basename(filePath),
    })
    if (batch.length >= batchSize) {
      flush(batch)
      batch = []
    }
    if (inserted >= rowLimit) break
  }
  if (batch.length && inserted < rowLimit) {
    const room = rowLimit - inserted
    flush(batch.slice(0, room))
  }
  return { inserted }
}

/** Legacy — async streaming ingest. */
export async function ingestAeFile(filePath, db = getHesDb()) {
  return ingestAeFileStreaming(filePath, db, {})
}

/** Rebuild FTS from base tables (e.g. after legacy ingest that did not populate `hes_fts`). */
export function rebuildHesFtsFromBaseTables(db = getHesDb()) {
  db.exec('DELETE FROM hes_fts')
  db.exec(`
    INSERT INTO hes_fts (lsoa, pseudo_hes_id, dataset, src_rowid)
    SELECT lsoa, pseudo_hes_id, 'ae', id FROM hes_ae
  `)
  db.exec(`
    INSERT INTO hes_fts (lsoa, pseudo_hes_id, dataset, src_rowid)
    SELECT lsoa, pseudo_hes_id, 'op', id FROM hes_op
  `)
  db.exec(`
    INSERT INTO hes_fts (lsoa, pseudo_hes_id, dataset, src_rowid)
    SELECT lsoa, pseudo_hes_id, 'apc', id FROM hes_apc
  `)
  return hesStats(db)
}

/**
 * Clear one HES dataset and rebuild FTS from the remaining base tables.
 * Do **not** use `DELETE FROM hes_fts WHERE dataset = ?` — `dataset` is FTS5 UNINDEXED and the scan
 * blocks for a very long time on large indexes.
 */
export function clearAe(db = getHesDb()) {
  db.exec('DELETE FROM hes_ae')
  rebuildHesFtsFromBaseTables(db)
}

export function clearOp(db = getHesDb()) {
  db.exec('DELETE FROM hes_op')
  rebuildHesFtsFromBaseTables(db)
}

export function clearApc(db = getHesDb()) {
  db.exec('DELETE FROM hes_apc')
  rebuildHesFtsFromBaseTables(db)
}

export function clearAllHes(db = getHesDb()) {
  db.exec('DELETE FROM hes_fts')
  db.exec('DELETE FROM hes_ae')
  db.exec('DELETE FROM hes_op')
  db.exec('DELETE FROM hes_apc')
}

export function setIngestMeta(key, value, db = getHesDb()) {
  db.prepare(
    `INSERT INTO hes_ingest_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

export function getIngestMeta(key, db = getHesDb()) {
  const row = db.prepare('SELECT value FROM hes_ingest_meta WHERE key = ?').get(key)
  return row?.value ?? null
}

export function getAllIngestMeta(db = getHesDb()) {
  return db.prepare('SELECT key, value FROM hes_ingest_meta ORDER BY key').all()
}

export function hesDbFileStats() {
  const dbPath = process.env.HES_SQLITE_PATH?.trim() || defaultDbPath()
  try {
    const st = fs.statSync(dbPath)
    return { path: dbPath, bytes: st.size }
  } catch {
    return { path: dbPath, bytes: 0 }
  }
}

export function aggregateAeByLsoa(lsoaFilter, db = getHesDb()) {
  if (lsoaFilter && typeof lsoaFilter === 'string' && lsoaFilter.trim()) {
    const l = lsoaFilter.trim()
    const rows = db
      .prepare(
        `SELECT lsoa, COUNT(*) AS count,
                AVG(arrival_age) AS avg_age,
                COUNT(DISTINCT ae_disp) AS disp_values
         FROM hes_ae WHERE lsoa = ? GROUP BY lsoa`,
      )
      .all(l)
    return rows
  }
  const rows = db
    .prepare(
      `SELECT lsoa, COUNT(*) AS count,
              AVG(arrival_age) AS avg_age
       FROM hes_ae WHERE lsoa IS NOT NULL AND lsoa != ''
       GROUP BY lsoa ORDER BY count DESC LIMIT 25`,
    )
    .all()
  return rows
}

export function aggregateOpByLsoa(lsoaFilter, db = getHesDb()) {
  if (lsoaFilter && typeof lsoaFilter === 'string' && lsoaFilter.trim()) {
    const l = lsoaFilter.trim()
    return db
      .prepare(
        `SELECT lsoa, COUNT(*) AS count, AVG(appt_age) AS avg_age
         FROM hes_op WHERE lsoa = ? GROUP BY lsoa`,
      )
      .all(l)
  }
  return db
    .prepare(
      `SELECT lsoa, COUNT(*) AS count, AVG(appt_age) AS avg_age
       FROM hes_op WHERE lsoa IS NOT NULL AND lsoa != ''
       GROUP BY lsoa ORDER BY count DESC LIMIT 25`,
    )
    .all()
}

export function aggregateApcByLsoa(lsoaFilter, db = getHesDb()) {
  if (lsoaFilter && typeof lsoaFilter === 'string' && lsoaFilter.trim()) {
    const l = lsoaFilter.trim()
    return db
      .prepare(
        `SELECT lsoa, COUNT(*) AS count, AVG(spell_duration) AS avg_spell_duration
         FROM hes_apc WHERE lsoa = ? GROUP BY lsoa`,
      )
      .all(l)
  }
  return db
    .prepare(
      `SELECT lsoa, COUNT(*) AS count, AVG(spell_duration) AS avg_spell_duration
       FROM hes_apc WHERE lsoa IS NOT NULL AND lsoa != ''
       GROUP BY lsoa ORDER BY count DESC LIMIT 25`,
    )
    .all()
}

/** Cross-dataset summary payload for Featherless (capped). */
export function aggregateCrossDatasetSummary(lsoaFilter, db = getHesDb()) {
  const filter = lsoaFilter && typeof lsoaFilter === 'string' ? lsoaFilter.trim() : ''
  return {
    stats: hesStats(db),
    ae: aggregateAeByLsoa(filter || null, db),
    op: aggregateOpByLsoa(filter || null, db),
    apc: aggregateApcByLsoa(filter || null, db),
    filter: filter || null,
  }
}

/**
 * Cheap row estimates for `/insights/health` — **never** run `COUNT(*)` on multi-million-row HES tables or
 * the FTS5 virtual table from the Node main thread: it blocks the whole HTTP server for minutes.
 *
 * - Base tables: `sqlite_sequence.seq` (AUTOINCREMENT) or `MAX(rowid)` fallback.
 * - FTS: `MAX(id)` on `hes_fts_docsize` (one row per doc; ids are monotonic for append-only ingest).
 */
const HES_BASE_TABLES = /** @type {const} */ (['hes_ae', 'hes_op', 'hes_apc'])

function autoIncrementRowEstimate(db, tableName) {
  if (!HES_BASE_TABLES.includes(tableName)) {
    throw new Error('hesStats: invalid table')
  }
  try {
    const row = db.prepare('SELECT seq AS c FROM sqlite_sequence WHERE name = ?').get(tableName)
    if (row && Number.isFinite(row.c) && row.c >= 0) return row.c
  } catch {
    /* ignore */
  }
  try {
    const row = db.prepare(`SELECT COALESCE(MAX(rowid), 0) AS c FROM ${tableName}`).get()
    return row?.c ?? 0
  } catch {
    return 0
  }
}

function ftsDocumentRowEstimate(db) {
  try {
    const row = db.prepare('SELECT COALESCE(MAX(id), 0) AS c FROM hes_fts_docsize').get()
    return row?.c ?? 0
  } catch {
    return 0
  }
}

export function hesStats(db = getHesDb()) {
  return {
    aeRows: autoIncrementRowEstimate(db, 'hes_ae'),
    opRows: autoIncrementRowEstimate(db, 'hes_op'),
    apcRows: autoIncrementRowEstimate(db, 'hes_apc'),
    ftsRows: ftsDocumentRowEstimate(db),
  }
}

/**
 * FTS5 search — `q` is tokenized for MATCH (prefix supported with * on last token).
 * @param {{ q: string, dataset?: 'ae'|'op'|'apc'|'all', limit?: number, offset?: number }} opts
 */
export function searchHesFts(opts, db = getHesDb()) {
  const q = typeof opts.q === 'string' ? opts.q.trim() : ''
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 20))
  const offset = Math.max(0, Number(opts.offset) || 0)
  const dataset = opts.dataset || 'all'

  if (!q) {
    return { rows: [], match: 'empty' }
  }

  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 8)
  if (tokens.length === 0) {
    return { rows: [], match: 'empty' }
  }
  const matchExpr = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' AND ')
  if (dataset === 'all') {
    const rows = db
      .prepare(
        `SELECT rowid, lsoa, pseudo_hes_id, dataset, src_rowid
         FROM hes_fts
         WHERE hes_fts MATCH ?
         LIMIT ? OFFSET ?`,
      )
      .all(matchExpr, limit, offset)
    return { rows, match: matchExpr }
  }
  const rows = db
    .prepare(
      `SELECT rowid, lsoa, pseudo_hes_id, dataset, src_rowid
       FROM hes_fts
       WHERE hes_fts MATCH ? AND dataset = ?
       LIMIT ? OFFSET ?`,
    )
    .all(matchExpr, dataset, limit, offset)
  return { rows, match: matchExpr }
}

/** Prefix / fallback search on indexed LSOA when FTS returns nothing. */
export function searchHesPrefix(q, dataset, limit, db = getHesDb()) {
  const prefix = typeof q === 'string' ? q.trim().slice(0, 20) : ''
  const lim = Math.min(200, Math.max(1, limit || 20))
  if (!prefix) return { rows: [] }
  const like = `${prefix}%`
  const out = []
  if (dataset === 'all' || dataset === 'ae') {
    const r = db
      .prepare(
        `SELECT id, pseudo_hes_id, lsoa, 'ae' AS dataset FROM hes_ae
         WHERE lsoa LIKE ? OR pseudo_hes_id LIKE ? LIMIT ?`,
      )
      .all(like, like, lim)
    out.push(...r.map((x) => ({ ...x, src_rowid: x.id })))
  }
  if (dataset === 'all' || dataset === 'op') {
    const r = db
      .prepare(
        `SELECT id, pseudo_hes_id, lsoa, 'op' AS dataset FROM hes_op
         WHERE lsoa LIKE ? OR pseudo_hes_id LIKE ? LIMIT ?`,
      )
      .all(like, like, lim)
    out.push(...r.map((x) => ({ ...x, src_rowid: x.id })))
  }
  if (dataset === 'all' || dataset === 'apc') {
    const r = db
      .prepare(
        `SELECT id, pseudo_hes_id, lsoa, 'apc' AS dataset FROM hes_apc
         WHERE lsoa LIKE ? OR pseudo_hes_id LIKE ? LIMIT ?`,
      )
      .all(like, like, lim)
    out.push(...r.map((x) => ({ ...x, src_rowid: x.id })))
  }
  return { rows: out.slice(0, lim) }
}
