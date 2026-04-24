import express from 'express'
import { fhirLookupSnomedConcept, getSnowstormStatus } from './snowstormClient.js'
import { getRf2Concept, getRf2Health, searchRf2Concepts } from './rf2LocalDb.js'

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

  router.get('/rf2/health', async (_req, res) => {
    try {
      res.json(await getRf2Health())
    } catch (e) {
      res.status(500).json({ error: String(e?.message ?? e) })
    }
  })

  router.get('/rf2/search', async (req, res) => {
    const q = String(req.query.q || '').trim()
    if (!q) {
      return res.status(400).json({ error: 'q is required' })
    }
    const limit = String(req.query.limit || '25')
    const offset = String(req.query.offset || '0')
    try {
      const out = await searchRf2Concepts(q, Number.parseInt(limit, 10), Number.parseInt(offset, 10))
      return res.json(out)
    } catch (e) {
      return res.status(500).json({ error: String(e?.message ?? e) })
    }
  })

  router.get('/rf2/concept/:conceptId', async (req, res) => {
    const id = String(req.params.conceptId || '').trim()
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'conceptId must be numeric (SCTID)' })
    }
    try {
      const concept = await getRf2Concept(id)
      if (!concept) return res.status(404).json({ error: 'Concept not found in local RF2 index' })
      return res.json(concept)
    } catch (e) {
      return res.status(500).json({ error: String(e?.message ?? e) })
    }
  })

  return router
}
