import express from 'express'
import { fhirLookupSnomedConcept, getSnowstormStatus } from './snowstormClient.js'

/**
 * Read-only SNOMED / Snowstorm routes (no x402 — public terminology lookups).
 */
export function createSnomedRouter() {
  const router = express.Router()

  router.get('/health', async (_req, res) => {
    try {
      res.json(await getSnowstormStatus())
    } catch (e) {
      res.status(500).json({ error: String(e?.message ?? e) })
    }
  })

  router.get('/lookup/:conceptId', async (req, res) => {
    const id = String(req.params.conceptId || '').trim()
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'conceptId must be a numeric SNOMED concept identifier' })
    }
    // #region agent log
    fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
      body: JSON.stringify({
        sessionId: '8e1b23',
        runId: 'run-snomed-system-uri-1',
        hypothesisId: 'H5',
        location: 'server/snomed/router.js:/lookup/:conceptId:entry',
        message: 'SNOMED lookup route called',
        data: {
          conceptId: id,
          queryVersion: typeof req.query?.version === 'string' ? req.query.version : null,
          querySystem: typeof req.query?.system === 'string' ? req.query.system : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    try {
      const result = await fhirLookupSnomedConcept(id)
      const issueCode =
        result &&
        result.body &&
        typeof result.body === 'object' &&
        Array.isArray(result.body.issue) &&
        result.body.issue[0] &&
        typeof result.body.issue[0] === 'object'
          ? String(result.body.issue[0].code || '')
          : ''
      const looksLikeMissingLocalEdition = result.status === 404 && issueCode === 'not-found'
      const code = result.ok
        ? 200
        : result.status >= 400 && result.status < 600
          ? result.status
          : 502
      if (looksLikeMissingLocalEdition) {
        // #region agent log
        fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
          body: JSON.stringify({
            sessionId: '8e1b23',
            runId: 'run-snomed-system-uri-1',
            hypothesisId: 'H3_H4',
            location: 'server/snomed/router.js:/lookup/:conceptId:not-found-hint',
            message: 'Returning not-found with local edition hint',
            data: {
              conceptId: id,
              status: result.status,
              issueCode,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        return res.status(code).json({
          ...result,
          hint:
            'Concept not found in this Snowstorm content set/branch. If this concept exists in NHS Browser, your local Snowstorm likely does not have the same UK edition release loaded.',
          references: {
            nhsBrowser: `https://termbrowser.nhs.uk/?perspective=full&conceptId1=${encodeURIComponent(id)}`,
            snomedInternational: 'https://browser.ihtsdotools.org/',
          },
        })
      }
      return res.status(code).json(result)
    } catch (e) {
      return res.status(502).json({ error: String(e?.message ?? e) })
    }
  })

  return router
}
