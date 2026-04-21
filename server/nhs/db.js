import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'

const dataDir = path.resolve(process.cwd(), 'data')
const dbPath = process.env.NHS_DB_PATH || path.join(dataDir, 'nhs.sqlite')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patient_records (
  patient_id TEXT PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  dob TEXT,
  nhs_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gp_access_requests (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  request_text TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_gp_wallet TEXT,
  receipt_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS care_plans (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  owner_wallet TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS care_plan_updates (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  note TEXT NOT NULL,
  updated_by_wallet TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_prescribing_referrals (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  referred_by_wallet TEXT NOT NULL,
  reason TEXT NOT NULL,
  link_worker_wallet TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_link_worker_plans (
  id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL,
  what_matters TEXT NOT NULL,
  interventions_json TEXT NOT NULL,
  updated_by_wallet TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS neighbourhood_team_events (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_by_wallet TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  threshold_min REAL,
  threshold_max REAL,
  created_by_wallet TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_readings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  value REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reading_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_wallet TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_wallet TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payment_receipt_ref TEXT,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
`)

function migrateNhsSchema() {
  const gprCols = db.prepare(`PRAGMA table_info(gp_access_requests)`).all()
  const gprNames = new Set(gprCols.map((c) => c.name))
  if (!gprNames.has('receipt_ref')) {
    db.exec(`ALTER TABLE gp_access_requests ADD COLUMN receipt_ref TEXT`)
  }
}

migrateNhsSchema()

function nowIso() {
  return new Date().toISOString()
}

export function upsertUser({ walletAddress, role }) {
  const now = nowIso()
  db.prepare(`
    INSERT INTO users (wallet_address, role, created_at, updated_at)
    VALUES (@wallet, @role, @now, @now)
    ON CONFLICT(wallet_address) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
  `).run({ wallet: walletAddress.toLowerCase(), role, now })
}

export function getUserByWallet(walletAddress) {
  return (
    db.prepare('SELECT wallet_address AS walletAddress, role FROM users WHERE wallet_address = ?').get(walletAddress.toLowerCase()) ||
    null
  )
}

export function upsertPatientRecord({ patientId, walletAddress, fullName, dob, nhsNumber, notes }) {
  const now = nowIso()
  db.prepare(`
    INSERT INTO patient_records (patient_id, wallet_address, full_name, dob, nhs_number, notes, created_at, updated_at)
    VALUES (@patientId, @wallet, @fullName, @dob, @nhsNumber, @notes, @now, @now)
    ON CONFLICT(patient_id) DO UPDATE SET
      wallet_address = excluded.wallet_address,
      full_name = excluded.full_name,
      dob = excluded.dob,
      nhs_number = excluded.nhs_number,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run({
    patientId,
    wallet: walletAddress.toLowerCase(),
    fullName,
    dob: dob || null,
    nhsNumber: nhsNumber || null,
    notes: notes || null,
    now,
  })
}

export function getPatientByWallet(walletAddress) {
  return (
    db
      .prepare(
        'SELECT patient_id AS patientId, wallet_address AS walletAddress, full_name AS fullName, dob, nhs_number AS nhsNumber, notes FROM patient_records WHERE wallet_address = ?',
      )
      .get(walletAddress.toLowerCase()) || null
  )
}

export function getPatientById(patientId) {
  return (
    db
      .prepare(
        'SELECT patient_id AS patientId, wallet_address AS walletAddress, full_name AS fullName, dob, nhs_number AS nhsNumber, notes FROM patient_records WHERE patient_id = ?',
      )
      .get(patientId) || null
  )
}

export function insert(table, payload) {
  const keys = Object.keys(payload)
  const columns = keys.join(', ')
  const placeholders = keys.map((k) => `@${k}`).join(', ')
  db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`).run(payload)
}

export function all(sql, params = []) {
  return db.prepare(sql).all(...params)
}

export function get(sql, params = []) {
  return db.prepare(sql).get(...params) || null
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params)
}

export function appendAudit({
  actorWallet,
  actorRole,
  action,
  entityType,
  entityId,
  payload,
  paymentReceiptRef = null,
}) {
  insert('audit_events', {
    id: crypto.randomUUID(),
    actor_wallet: actorWallet.toLowerCase(),
    actor_role: actorRole,
    action,
    entity_type: entityType,
    entity_id: entityId,
    payment_receipt_ref: paymentReceiptRef,
    created_at: nowIso(),
    payload_json: JSON.stringify(payload ?? {}),
  })
}

export function listPatientTimeline(patientId) {
  const carePlans = all(
    `
      SELECT id, 'care_plan' AS kind, updated_at AS eventAt, goal AS summary
      FROM care_plans
      WHERE patient_id = ?
    `,
    [patientId],
  )
  const referrals = all(
    `
      SELECT id, 'social_referral' AS kind, updated_at AS eventAt, reason AS summary
      FROM social_prescribing_referrals
      WHERE patient_id = ?
    `,
    [patientId],
  )
  const monitoring = all(
    `
      SELECT id, 'monitoring_reading' AS kind, created_at AS eventAt, source || ': ' || value AS summary
      FROM monitoring_readings
      WHERE patient_id = ?
    `,
    [patientId],
  )
  return [...carePlans, ...referrals, ...monitoring].sort((a, b) => b.eventAt.localeCompare(a.eventAt))
}

