import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FSN_TYPE_ID = '900000000000003001'
const SYNONYM_TYPE_ID = '900000000000013009'
const ISA_TYPE_ID = '116680003'
const DEFAULT_RF2_BASE_DIR = '/Users/openclaw/Downloads/uk_sct2cl_42.0.0_20260408000001Z'

let _db
let _buildPromise = null
let _lastBuild = {
  startedAt: null,
  finishedAt: null,
  status: 'idle',
  error: null,
}

function rf2BaseDir() {
  return (process.env.SNOMED_RF2_BASE_DIR || '').trim() || DEFAULT_RF2_BASE_DIR
}

function dbPath() {
  const configured = (process.env.SNOMED_RF2_SQLITE_PATH || '').trim()
  if (configured) return configured
  const root = path.join(__dirname, '..', '..', 'data')
  try {
    fs.mkdirSync(root, { recursive: true })
  } catch {
    /* ignore */
  }
  return path.join(root, 'snomed-rf2.db')
}

function openDb() {
  if (_db) return _db
  _db = new Database(dbPath())
  _db.pragma('journal_mode = WAL')
  _db.pragma('synchronous = NORMAL')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS rf2_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rf2_concepts (
      conceptId TEXT PRIMARY KEY,
      effectiveTime TEXT,
      active INTEGER NOT NULL,
      moduleId TEXT,
      definitionStatusId TEXT,
      sourcePackage TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rf2_descriptions (
      descriptionId TEXT PRIMARY KEY,
      conceptId TEXT NOT NULL,
      effectiveTime TEXT,
      active INTEGER NOT NULL,
      moduleId TEXT,
      languageCode TEXT,
      typeId TEXT,
      term TEXT,
      caseSignificanceId TEXT,
      sourcePackage TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rf2_relationships (
      relationshipId TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      destinationId TEXT NOT NULL,
      relationshipGroup INTEGER,
      typeId TEXT NOT NULL,
      effectiveTime TEXT,
      active INTEGER NOT NULL,
      characteristicTypeId TEXT,
      modifierId TEXT,
      moduleId TEXT,
      sourcePackage TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS rf2_descriptions_fts USING fts5(
      term,
      conceptId UNINDEXED,
      descriptionId UNINDEXED,
      typeId UNINDEXED,
      languageCode UNINDEXED,
      tokenize = 'unicode61'
    );
    CREATE INDEX IF NOT EXISTS idx_rf2_desc_concept ON rf2_descriptions(conceptId);
    CREATE INDEX IF NOT EXISTS idx_rf2_desc_active ON rf2_descriptions(active);
    CREATE INDEX IF NOT EXISTS idx_rf2_rel_source ON rf2_relationships(sourceId);
    CREATE INDEX IF NOT EXISTS idx_rf2_rel_dest ON rf2_relationships(destinationId);
    CREATE INDEX IF NOT EXISTS idx_rf2_rel_type ON rf2_relationships(typeId);
  `)
  return _db
}

function setMeta(key, value) {
  const db = openDb()
  db.prepare(
    `INSERT INTO rf2_meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(key, value)
}

function getMeta(key) {
  const db = openDb()
  const row = db.prepare('SELECT value FROM rf2_meta WHERE key = ?').get(key)
  return row ? String(row.value) : null
}

function findSnapshotFiles(baseDir) {
  if (!fs.existsSync(baseDir)) return []
  const packageDirs = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(baseDir, d.name))

  const files = []
  for (const pkgDir of packageDirs) {
    const snap = path.join(pkgDir, 'Snapshot')
    if (!fs.existsSync(snap)) continue
    const terminology = path.join(snap, 'Terminology')
    if (fs.existsSync(terminology)) {
      for (const name of fs.readdirSync(terminology)) {
        if (!name.endsWith('.txt')) continue
        if (
          name.startsWith('sct2_Concept_') ||
          name.startsWith('sct2_Description_') ||
          name.startsWith('sct2_Relationship_')
        ) {
          files.push({
            kind: name.startsWith('sct2_Concept_')
              ? 'concept'
              : name.startsWith('sct2_Description_')
                ? 'description'
                : 'relationship',
            packageName: path.basename(pkgDir),
            path: path.join(terminology, name),
          })
        }
      }
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return files
}

function buildManifest(files) {
  return JSON.stringify(
    files.map((f) => {
      const st = fs.statSync(f.path)
      return {
        kind: f.kind,
        packageName: f.packageName,
        path: f.path,
        size: st.size,
        mtimeMs: Math.floor(st.mtimeMs),
      }
    }),
  )
}

function parseIntFlag(v) {
  return String(v) === '1' ? 1 : 0
}

async function loadConceptFile(filePath, packageName) {
  const db = openDb()
  const upsert = db.prepare(`
    INSERT INTO rf2_concepts(conceptId, effectiveTime, active, moduleId, definitionStatusId, sourcePackage)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(conceptId) DO UPDATE SET
      effectiveTime=excluded.effectiveTime,
      active=excluded.active,
      moduleId=excluded.moduleId,
      definitionStatusId=excluded.definitionStatusId,
      sourcePackage=excluded.sourcePackage
  `)
  let count = 0
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let first = true
  const tx = db.transaction((rows) => {
    for (const cols of rows) {
      upsert.run(cols[0], cols[1], parseIntFlag(cols[2]), cols[3], cols[4], packageName)
    }
  })
  let batch = []
  for await (const line of rl) {
    if (first) {
      first = false
      continue
    }
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < 5) continue
    batch.push(cols)
    if (batch.length >= 2500) {
      tx(batch)
      count += batch.length
      batch = []
    }
  }
  if (batch.length) {
    tx(batch)
    count += batch.length
  }
  return count
}

async function loadDescriptionFile(filePath, packageName) {
  const db = openDb()
  const upsert = db.prepare(`
    INSERT INTO rf2_descriptions(descriptionId, conceptId, effectiveTime, active, moduleId, languageCode, typeId, term, caseSignificanceId, sourcePackage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(descriptionId) DO UPDATE SET
      conceptId=excluded.conceptId,
      effectiveTime=excluded.effectiveTime,
      active=excluded.active,
      moduleId=excluded.moduleId,
      languageCode=excluded.languageCode,
      typeId=excluded.typeId,
      term=excluded.term,
      caseSignificanceId=excluded.caseSignificanceId,
      sourcePackage=excluded.sourcePackage
  `)
  const insertFts = db.prepare(
    'INSERT INTO rf2_descriptions_fts(term, conceptId, descriptionId, typeId, languageCode) VALUES (?, ?, ?, ?, ?)',
  )
  let count = 0
  let activeCount = 0
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let first = true
  const tx = db.transaction((rows) => {
    for (const cols of rows) {
      const active = parseIntFlag(cols[2])
      upsert.run(
        cols[0],
        cols[4],
        cols[1],
        active,
        cols[3],
        cols[5],
        cols[6],
        cols[7],
        cols[8],
        packageName,
      )
      if (active === 1 && cols[7]) {
        insertFts.run(cols[7], cols[4], cols[0], cols[6], cols[5])
      }
    }
  })
  let batch = []
  for await (const line of rl) {
    if (first) {
      first = false
      continue
    }
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < 9) continue
    batch.push(cols)
    if (parseIntFlag(cols[2]) === 1) activeCount += 1
    if (batch.length >= 2000) {
      tx(batch)
      count += batch.length
      batch = []
    }
  }
  if (batch.length) {
    tx(batch)
    count += batch.length
  }
  return { count, activeCount }
}

async function loadRelationshipFile(filePath, packageName) {
  const db = openDb()
  const upsert = db.prepare(`
    INSERT INTO rf2_relationships(relationshipId, sourceId, destinationId, relationshipGroup, typeId, effectiveTime, active, characteristicTypeId, modifierId, moduleId, sourcePackage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(relationshipId) DO UPDATE SET
      sourceId=excluded.sourceId,
      destinationId=excluded.destinationId,
      relationshipGroup=excluded.relationshipGroup,
      typeId=excluded.typeId,
      effectiveTime=excluded.effectiveTime,
      active=excluded.active,
      characteristicTypeId=excluded.characteristicTypeId,
      modifierId=excluded.modifierId,
      moduleId=excluded.moduleId,
      sourcePackage=excluded.sourcePackage
  `)
  let count = 0
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let first = true
  const tx = db.transaction((rows) => {
    for (const cols of rows) {
      upsert.run(
        cols[0],
        cols[4],
        cols[5],
        Number.parseInt(cols[6], 10) || 0,
        cols[7],
        cols[1],
        parseIntFlag(cols[2]),
        cols[8],
        cols[9],
        cols[3],
        packageName,
      )
    }
  })
  let batch = []
  for await (const line of rl) {
    if (first) {
      first = false
      continue
    }
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < 10) continue
    batch.push(cols)
    if (batch.length >= 1500) {
      tx(batch)
      count += batch.length
      batch = []
    }
  }
  if (batch.length) {
    tx(batch)
    count += batch.length
  }
  return count
}

async function rebuildIndex(files, manifest) {
  const db = openDb()
  _lastBuild = { startedAt: new Date().toISOString(), finishedAt: null, status: 'running', error: null }
  setMeta('rf2_build_status', JSON.stringify(_lastBuild))
  db.exec(`
    DELETE FROM rf2_descriptions_fts;
    DELETE FROM rf2_relationships;
    DELETE FROM rf2_descriptions;
    DELETE FROM rf2_concepts;
  `)
  const stats = {
    concepts: 0,
    descriptions: 0,
    activeDescriptions: 0,
    relationships: 0,
  }

  for (const file of files) {
    if (file.kind === 'concept') stats.concepts += await loadConceptFile(file.path, file.packageName)
    if (file.kind === 'description') {
      const x = await loadDescriptionFile(file.path, file.packageName)
      stats.descriptions += x.count
      stats.activeDescriptions += x.activeCount
    }
    if (file.kind === 'relationship') stats.relationships += await loadRelationshipFile(file.path, file.packageName)
  }

  setMeta('rf2_manifest', manifest)
  setMeta('rf2_stats', JSON.stringify(stats))
  _lastBuild = { ..._lastBuild, finishedAt: new Date().toISOString(), status: 'ready' }
  setMeta('rf2_build_status', JSON.stringify(_lastBuild))
}

export async function ensureRf2Index() {
  if (_buildPromise) return _buildPromise
  _buildPromise = (async () => {
    const base = rf2BaseDir()
    if (!fs.existsSync(base)) {
      throw new Error(`SNOMED RF2 base path not found: ${base}`)
    }
    const files = findSnapshotFiles(base)
    if (files.length === 0) {
      throw new Error(`No RF2 Snapshot concept/description/relationship files found under ${base}`)
    }
    const manifest = buildManifest(files)
    const existing = getMeta('rf2_manifest')
    if (existing !== manifest) {
      await rebuildIndex(files, manifest)
    } else if (getMeta('rf2_build_status') == null) {
      setMeta(
        'rf2_build_status',
        JSON.stringify({
          startedAt: null,
          finishedAt: null,
          status: 'ready',
          error: null,
        }),
      )
    }
  })()
  try {
    await _buildPromise
  } catch (error) {
    _lastBuild = {
      startedAt: _lastBuild.startedAt,
      finishedAt: new Date().toISOString(),
      status: 'error',
      error: String(error?.message || error),
    }
    setMeta('rf2_build_status', JSON.stringify(_lastBuild))
    throw error
  } finally {
    _buildPromise = null
  }
}

function preferredTermFor(conceptId) {
  const db = openDb()
  const row = db
    .prepare(
      `SELECT term
       FROM rf2_descriptions
       WHERE conceptId = ? AND active = 1 AND typeId = ?
       ORDER BY CASE WHEN languageCode = 'en' THEN 0 ELSE 1 END, LENGTH(term)
       LIMIT 1`,
    )
    .get(conceptId, SYNONYM_TYPE_ID)
  return row ? row.term : null
}

function fsnFor(conceptId) {
  const db = openDb()
  const row = db
    .prepare(
      `SELECT term
       FROM rf2_descriptions
       WHERE conceptId = ? AND active = 1 AND typeId = ?
       ORDER BY LENGTH(term)
       LIMIT 1`,
    )
    .get(conceptId, FSN_TYPE_ID)
  return row ? row.term : null
}

export async function searchRf2Concepts(query, limit = 25, offset = 0) {
  await ensureRf2Index()
  const q = String(query || '').trim()
  if (!q) return { query: q, count: 0, rows: [] }
  const db = openDb()
  const lim = Math.max(1, Math.min(200, Number.parseInt(String(limit), 10) || 25))
  const off = Math.max(0, Number.parseInt(String(offset), 10) || 0)
  const sctidRow = /^\d+$/.test(q)
    ? db
        .prepare(
          `SELECT c.conceptId, c.active, c.moduleId, c.effectiveTime
           FROM rf2_concepts c
           WHERE c.conceptId = ?`,
        )
        .get(q)
    : null
  const rows = db
    .prepare(
      `SELECT conceptId,
              MIN(bm25(rf2_descriptions_fts)) as score,
              COUNT(*) as matchCount
       FROM rf2_descriptions_fts
       WHERE rf2_descriptions_fts MATCH ?
       GROUP BY conceptId
       ORDER BY score
       LIMIT ? OFFSET ?`,
    )
    .all(q, lim, off)

  const mapped = rows.map((row) => {
    const concept = db.prepare('SELECT active, moduleId, effectiveTime FROM rf2_concepts WHERE conceptId = ?').get(row.conceptId)
    return {
      conceptId: row.conceptId,
      preferredTerm: preferredTermFor(row.conceptId),
      fsn: fsnFor(row.conceptId),
      active: concept ? concept.active === 1 : false,
      moduleId: concept?.moduleId ?? null,
      effectiveTime: concept?.effectiveTime ?? null,
      score: row.score,
      matchCount: row.matchCount,
    }
  })

  if (sctidRow && !mapped.some((r) => r.conceptId === q)) {
    mapped.unshift({
      conceptId: q,
      preferredTerm: preferredTermFor(q),
      fsn: fsnFor(q),
      active: sctidRow.active === 1,
      moduleId: sctidRow.moduleId ?? null,
      effectiveTime: sctidRow.effectiveTime ?? null,
      score: 0,
      matchCount: 1,
    })
  }

  return { query: q, count: mapped.length, rows: mapped }
}

export async function getRf2Concept(sctid) {
  await ensureRf2Index()
  const id = String(sctid || '').trim()
  if (!/^\d+$/.test(id)) return null
  const db = openDb()
  const concept = db
    .prepare(
      `SELECT conceptId, active, moduleId, effectiveTime, definitionStatusId, sourcePackage
       FROM rf2_concepts
       WHERE conceptId = ?`,
    )
    .get(id)
  if (!concept) return null

  const descriptions = db
    .prepare(
      `SELECT descriptionId, term, typeId, languageCode, active, effectiveTime, moduleId
       FROM rf2_descriptions
       WHERE conceptId = ?
       ORDER BY active DESC, CASE WHEN typeId = ? THEN 0 WHEN typeId = ? THEN 1 ELSE 2 END, term`,
    )
    .all(id, FSN_TYPE_ID, SYNONYM_TYPE_ID)

  const parents = db
    .prepare(
      `SELECT r.destinationId as conceptId
       FROM rf2_relationships r
       WHERE r.sourceId = ? AND r.typeId = ? AND r.active = 1
       ORDER BY r.destinationId`,
    )
    .all(id, ISA_TYPE_ID)
    .map((row) => ({
      conceptId: row.conceptId,
      preferredTerm: preferredTermFor(row.conceptId),
      fsn: fsnFor(row.conceptId),
    }))

  const children = db
    .prepare(
      `SELECT r.sourceId as conceptId
       FROM rf2_relationships r
       WHERE r.destinationId = ? AND r.typeId = ? AND r.active = 1
       ORDER BY r.sourceId
       LIMIT 300`,
    )
    .all(id, ISA_TYPE_ID)
    .map((row) => ({
      conceptId: row.conceptId,
      preferredTerm: preferredTermFor(row.conceptId),
      fsn: fsnFor(row.conceptId),
    }))

  return {
    conceptId: concept.conceptId,
    active: concept.active === 1,
    moduleId: concept.moduleId,
    effectiveTime: concept.effectiveTime,
    definitionStatusId: concept.definitionStatusId,
    sourcePackage: concept.sourcePackage,
    preferredTerm: preferredTermFor(id),
    fsn: fsnFor(id),
    descriptions,
    parents,
    children,
  }
}

export async function getRf2Health() {
  const base = rf2BaseDir()
  const configured = fs.existsSync(base)
  const buildStatusRaw = getMeta('rf2_build_status')
  const statsRaw = getMeta('rf2_stats')
  const manifestRaw = getMeta('rf2_manifest')
  const buildStatus = buildStatusRaw ? JSON.parse(buildStatusRaw) : _lastBuild
  const stats = statsRaw ? JSON.parse(statsRaw) : null
  let fileCount = 0
  try {
    fileCount = findSnapshotFiles(base).length
  } catch {
    fileCount = 0
  }
  return {
    configured,
    baseDir: base,
    dbPath: dbPath(),
    fileCount,
    buildStatus,
    stats,
    hasIndexedManifest: Boolean(manifestRaw),
    supports: {
      search: '/api/snomed/rf2/search?q=pregnancy',
      concept: '/api/snomed/rf2/concept/289908002',
    },
  }
}
