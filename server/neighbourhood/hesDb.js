/**
 * SQLite store for artificial HES sample rows (AE / OP / APC) — fast aggregates for paid neighbourhood insights.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
  return _db
}

/** @param {string} line */
function parseCsvLine(line) {
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

/**
 * Ingest one AE CSV file (header row + data).
 * @param {string} filePath
 * @param {import('better-sqlite3').Database} db
 */
export function ingestAeFile(filePath, db = getHesDb()) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return { inserted: 0 }
  const header = parseCsvLine(lines[0])
  const iPse = colIndex(header, 'PSEUDO_HESID')
  const iFy = colIndex(header, 'FYEAR')
  const iPy = colIndex(header, 'PARTYEAR')
  const iLsoa = colIndex(header, 'LSOA01') >= 0 ? colIndex(header, 'LSOA01') : colIndex(header, 'LSOA11')
  const iAge = colIndex(header, 'ARRIVALAGE')
  const iDate = colIndex(header, 'ARRIVALDATE')
  const iDisp = colIndex(header, 'AEATTENDDISP')

  const insert = db.prepare(
    `INSERT INTO hes_ae (pseudo_hes_id, fyear, partyear, lsoa, arrival_age, arrival_date, ae_disp, source_file)
     VALUES (@pseudo_hes_id, @fyear, @partyear, @lsoa, @arrival_age, @arrival_date, @ae_disp, @source_file)`,
  )

  let inserted = 0
  const run = db.transaction(() => {
    for (let r = 1; r < lines.length; r++) {
      const row = parseCsvLine(lines[r])
      if (row.length < header.length * 0.5) continue
      insert.run({
        pseudo_hes_id: iPse >= 0 ? row[iPse] ?? '' : '',
        fyear: iFy >= 0 ? row[iFy] ?? '' : '',
        partyear: iPy >= 0 ? row[iPy] ?? '' : '',
        lsoa: iLsoa >= 0 ? row[iLsoa] ?? '' : '',
        arrival_age: iAge >= 0 ? Number.parseFloat(row[iAge] || '0') : null,
        arrival_date: iDate >= 0 ? row[iDate] ?? '' : '',
        ae_disp: iDisp >= 0 ? row[iDisp] ?? '' : '',
        source_file: path.basename(filePath),
      })
      inserted++
    }
  })
  run()
  return { inserted }
}

export function clearAe(db = getHesDb()) {
  db.exec('DELETE FROM hes_ae')
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

export function hesStats(db = getHesDb()) {
  const ae = db.prepare('SELECT COUNT(*) AS c FROM hes_ae').get()
  const op = db.prepare('SELECT COUNT(*) AS c FROM hes_op').get()
  const apc = db.prepare('SELECT COUNT(*) AS c FROM hes_apc').get()
  return { aeRows: ae?.c ?? 0, opRows: op?.c ?? 0, apcRows: apc?.c ?? 0 }
}
