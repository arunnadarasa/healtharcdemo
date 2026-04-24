import express from 'express'
import { withArcGatewayGate } from '../nhs/payment.js'
import { fhirLookupSnomedConcept, getSnowstormStatus } from './snowstormClient.js'
import {
  getRf2Concept,
  getRf2Health,
  Rf2IndexNotReadyError,
  searchRf2Concepts,
} from './rf2LocalDb.js'

/**
 * SNOMED / Snowstorm read routes + local RF2 (free GET search/concept, optional paid POST search/concept).
 *
 * @param {{ gateway: import('@circle-fin/x402-batching/server').GatewayMiddleware, skipInternalGateway?: boolean|((req:any)=>boolean) }} deps
 */
export function createSnomedRouter(deps) {
  const router = express.Router()
  const gate = (config, handler) => withArcGatewayGate(deps, config, handler)
  const paymentGateEnabled = process.env.NHS_ENABLE_PAYMENT_GATE !== 'false'

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
      if (e instanceof Rf2IndexNotReadyError) {
        res.set('Retry-After', '5')
        return res.status(503).json({
          error: String(e?.message ?? e),
          buildStatus: e.buildStatus,
        })
      }
      return res.status(500).json({ error: String(e?.message ?? e) })
    }
  })

  router.post(
    '/rf2/search',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const q = String(req.body?.q ?? '').trim()
        if (!q) {
          return res.status(400).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: 'q is required',
          })
        }
        const limit = Number.parseInt(String(req.body?.limit ?? '25'), 10)
        const offset = Number.parseInt(String(req.body?.offset ?? '0'), 10)
        try {
          const out = await searchRf2Concepts(q, limit, offset)
          return res.json({ ok: true, receiptRef: paymentCtx.paymentReceiptRef ?? null, ...out })
        } catch (e) {
          if (e instanceof Rf2IndexNotReadyError) {
            res.set('Retry-After', '5')
            return res.status(503).json({
              ok: false,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
              error: String(e?.message ?? e),
              buildStatus: e.buildStatus,
            })
          }
          return res.status(500).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: String(e?.message ?? e),
          })
        }
      },
    ),
  )

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
      if (e instanceof Rf2IndexNotReadyError) {
        res.set('Retry-After', '5')
        return res.status(503).json({
          error: String(e?.message ?? e),
          buildStatus: e.buildStatus,
        })
      }
      return res.status(500).json({ error: String(e?.message ?? e) })
    }
  })

  router.post(
    '/rf2/concept',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const id = String(req.body?.conceptId ?? '').trim()
        if (!/^\d+$/.test(id)) {
          return res.status(400).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: 'conceptId must be numeric (SCTID)',
          })
        }
        try {
          const concept = await getRf2Concept(id)
          if (!concept) {
            return res.status(404).json({
              ok: false,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
              error: 'Concept not found in local RF2 index',
            })
          }
          return res.json({ ok: true, receiptRef: paymentCtx.paymentReceiptRef ?? null, ...concept })
        } catch (e) {
          if (e instanceof Rf2IndexNotReadyError) {
            res.set('Retry-After', '5')
            return res.status(503).json({
              ok: false,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
              error: String(e?.message ?? e),
              buildStatus: e.buildStatus,
            })
          }
          return res.status(500).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: String(e?.message ?? e),
          })
        }
      },
    ),
  )

  return router
}
