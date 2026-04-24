/**
 * Per-request x402 facilitator for neighbourhood + OpenEHR + dm+d + SNOMED + CDR routes.
 * Client sends `X-X402-Facilitator: thirdweb` | `circle`; falls back to `X402_FACILITATOR` env (default circle).
 * NHS `/api/nhs/*` routes ignore this (Circle Gateway only).
 */

function isPaidRoutedPost(req) {
  if (req.method !== 'POST') return false
  const path = req.path || ''
  if (
    !path.startsWith('/api/neighbourhood') &&
    !path.startsWith('/api/openehr') &&
    !path.startsWith('/api/dmd') &&
    !path.startsWith('/api/cdr') &&
    !path.startsWith('/api/snomed')
  )
    return false
  if (
    path.startsWith('/api/neighbourhood') &&
    (path.includes('/insights/lsoa') ||
      path.includes('/insights/summary') ||
      path.includes('/uk/search') ||
      path.includes('/uk/synthesis') ||
      path.includes('/scale/search') ||
      path.includes('/scale/cross-summary'))
  )
    return true
  if (path.startsWith('/api/openehr') && path.endsWith('/query/aql')) return true
  if (path.startsWith('/api/dmd') && (path.endsWith('/lookup') || path.endsWith('/summary'))) return true
  if (
    path === '/api/snomed/rf2/search' ||
    path === '/api/snomed/rf2/concept' ||
    path === '/api/snomed/rf2/summary'
  )
    return true
  if (
    path.startsWith('/api/cdr') &&
    (path.endsWith('/vaults/allocate') ||
      path.endsWith('/encrypt-store') ||
      path.endsWith('/request-access') ||
      path.endsWith('/recover') ||
      path.endsWith('/revoke'))
  )
    return true
  return false
}

/**
 * Express middleware: sets `req.nhsX402Facilitator` to `'thirdweb'` | `'circle'`.
 */
export function resolveNhsX402Facilitator(req, res, next) {
  const path = req.path || ''
  if (
    !path.startsWith('/api/neighbourhood') &&
    !path.startsWith('/api/openehr') &&
    !path.startsWith('/api/dmd') &&
    !path.startsWith('/api/cdr') &&
    !path.startsWith('/api/snomed')
  ) {
    return next()
  }

  const raw = req.get('x-x402-facilitator')
  let v = typeof raw === 'string' ? raw.toLowerCase().trim() : ''
  if (v !== 'thirdweb' && v !== 'circle') {
    const env = (process.env.X402_FACILITATOR || 'circle').toLowerCase().trim()
    v = env === 'thirdweb' ? 'thirdweb' : 'circle'
  }
  req.nhsX402Facilitator = v

  if (isPaidRoutedPost(req) && v === 'thirdweb' && !process.env.THIRDWEB_SECRET_KEY?.trim()) {
    return res.status(503).json({
      error:
        'x402 facilitator "thirdweb" was requested (X-X402-Facilitator) but THIRDWEB_SECRET_KEY is not set on the server. Choose Circle in the UI, set the secret, or use X402_FACILITATOR=circle.',
    })
  }
  next()
}
