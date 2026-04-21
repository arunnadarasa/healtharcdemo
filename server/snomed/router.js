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
    try {
      const result = await fhirLookupSnomedConcept(id)
      const code = result.ok
        ? 200
        : result.status >= 400 && result.status < 600
          ? result.status
          : 502
      return res.status(code).json(result)
    } catch (e) {
      return res.status(502).json({ error: String(e?.message ?? e) })
    }
  })

  return router
}
