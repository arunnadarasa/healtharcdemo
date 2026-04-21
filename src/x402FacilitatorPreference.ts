/**
 * User-selectable x402 settlement path for neighbourhood + OpenEHR BFF only.
 * NHS `/api/nhs/*` paid routes always use Circle Gateway (ignored here).
 */
const STORAGE_KEY = 'nhs_x402_facilitator_v1'

export type X402FacilitatorId = 'circle' | 'thirdweb'

function defaultFromEnv(): X402FacilitatorId {
  const env = import.meta.env.VITE_X402_FACILITATOR
  return typeof env === 'string' && env.toLowerCase().trim() === 'thirdweb' ? 'thirdweb' : 'circle'
}

export function getX402FacilitatorPreference(): X402FacilitatorId {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s === 'thirdweb' || s === 'circle') return s
  } catch {
    /* ignore */
  }
  return defaultFromEnv()
}

export function setX402FacilitatorPreference(v: X402FacilitatorId) {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    /* ignore */
  }
}

/** Circle-only paths — must match server (NHS router uses Gateway only). */
const CIRCLE_ONLY_PREFIXES = ['/api/nhs/']

export function getX402FacilitatorForPath(path: string): X402FacilitatorId {
  if (CIRCLE_ONLY_PREFIXES.some((p) => path.startsWith(p))) return 'circle'
  return getX402FacilitatorPreference()
}
