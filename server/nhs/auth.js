import { getPatientById, getPatientByWallet, getUserByWallet, upsertPatientRecord, upsertUser } from './db.js'

const ROLE_SET = new Set(['patient', 'gp', 'nhc_provider'])

function normalizeWallet(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed.startsWith('0x') || trimmed.length < 6) return null
  return trimmed
}

export function getActor(req) {
  const wallet = normalizeWallet(req.get('x-wallet-address') || req.body?.walletAddress || '')
  const requestedRole = req.get('x-user-role') || req.body?.role || ''
  if (!wallet) {
    return { error: 'Missing or invalid wallet identity. Send x-wallet-address header.' }
  }
  const role = ROLE_SET.has(requestedRole) ? requestedRole : 'patient'
  upsertUser({ walletAddress: wallet, role })
  return { walletAddress: wallet, role }
}

export function requireRoles(actor, allowedRoles) {
  if (!actor || actor.error) return actor?.error || 'Unauthenticated'
  if (!allowedRoles.includes(actor.role)) return 'Forbidden for role'
  return null
}

export function ensurePatientRecordForWallet(actor, payload = {}) {
  const existing = getPatientByWallet(actor.walletAddress)
  if (existing) return existing
  const patientId = payload.patientId || `pt_${actor.walletAddress.slice(2, 10)}`
  upsertPatientRecord({
    patientId,
    walletAddress: actor.walletAddress,
    fullName: payload.fullName || `Patient ${actor.walletAddress.slice(2, 8)}`,
    dob: payload.dob || null,
    nhsNumber: payload.nhsNumber || null,
    notes: payload.notes || null,
  })
  return getPatientById(patientId)
}

export function resolvePatientIdForActor(actor, requestedPatientId = null) {
  if (actor.role === 'patient') {
    const patient = getPatientByWallet(actor.walletAddress)
    return patient?.patientId || null
  }
  if (typeof requestedPatientId === 'string' && requestedPatientId) return requestedPatientId
  return null
}

export function getPersistedRole(walletAddress) {
  return getUserByWallet(walletAddress)?.role || null
}

