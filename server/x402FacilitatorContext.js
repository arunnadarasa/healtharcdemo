/**
 * Per-request x402 facilitator for neighbourhood + OpenEHR BFF routes.
 * Client sends `X-X402-Facilitator: thirdweb` | `circle`; falls back to `X402_FACILITATOR` env (default circle).
 * NHS `/api/nhs/*` routes ignore this (Circle Gateway only).
 */

function isPaidNeighbourhoodOrOpenehrPost(req) {
  if (req.method !== 'POST') return false
  const path = req.path || ''
  if (!path.startsWith('/api/neighbourhood') && !path.startsWith('/api/openehr')) return false
  if (
    path.startsWith('/api/neighbourhood') &&
    (path.includes('/insights/lsoa') ||
      path.includes('/insights/summary') ||
      path.includes('/scale/search') ||
      path.includes('/scale/cross-summary'))
  )
    return true
  if (path.startsWith('/api/openehr') && path.endsWith('/query/aql')) return true
  return false
}

/**
 * Express middleware: sets `req.nhsX402Facilitator` to `'thirdweb'` | `'circle'`.
 */
export function resolveNhsX402Facilitator(req, res, next) {
  const path = req.path || ''
  if (!path.startsWith('/api/neighbourhood') && !path.startsWith('/api/openehr')) {
    return next()
  }

  const raw = req.get('x-x402-facilitator')
  let v = typeof raw === 'string' ? raw.toLowerCase().trim() : ''
  if (v !== 'thirdweb' && v !== 'circle') {
    const env = (process.env.X402_FACILITATOR || 'circle').toLowerCase().trim()
    v = env === 'thirdweb' ? 'thirdweb' : 'circle'
  }
  req.nhsX402Facilitator = v
  // #region agent log
  if (isPaidNeighbourhoodOrOpenehrPost(req)) {
    fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
      body: JSON.stringify({
        sessionId: '8e1b23',
        runId: 'run-timeout-3',
        hypothesisId: 'V3',
        location: 'server/x402FacilitatorContext.js:resolveNhsX402Facilitator',
        message: 'Resolved facilitator for paid route',
        data: { path, facilitator: v },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
  }
  // #endregion

  if (isPaidNeighbourhoodOrOpenehrPost(req) && v === 'thirdweb' && !process.env.THIRDWEB_SECRET_KEY?.trim()) {
    return res.status(503).json({
      error:
        'x402 facilitator "thirdweb" was requested (X-X402-Facilitator) but THIRDWEB_SECRET_KEY is not set on the server. Choose Circle in the UI, set the secret, or use X402_FACILITATOR=circle.',
    })
  }
  next()
}
