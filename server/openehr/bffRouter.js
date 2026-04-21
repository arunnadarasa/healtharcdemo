import express from 'express'
import { withArcGatewayGate } from '../nhs/payment.js'
import { postAqlQuery } from './ehrbaseClient.js'

/**
 * BFF for EHRbase ITS REST AQL — x402 gated; browser never holds EHRbase credentials.
 * @param {{ gateway: import('@circle-fin/x402-batching/server').GatewayMiddleware, skipInternalGateway?: boolean }} deps
 */
export function createOpenehrBffRouter(deps) {
  const router = express.Router()
  const gate = (config, handler) => withArcGatewayGate(deps, config, handler)
  const paymentGateEnabled = process.env.NHS_ENABLE_PAYMENT_GATE !== 'false'

  router.post(
    '/query/aql',
    ...gate({ enabled: paymentGateEnabled, amount: '0.01' }, async (req, res, paymentCtx) => {
      const q = req.body?.q ?? req.body?.aql
      if (typeof q !== 'string' || !q.trim()) {
        return res.status(400).json({ error: 'Body must include { q: "AQL string" }' })
      }
      try {
        const result = await postAqlQuery(q.trim())
        return res.status(result.ok ? 200 : result.status).json({
          ...result,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
        })
      } catch (e) {
        return res.status(502).json({
          error: String(e?.message ?? e),
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
        })
      }
    }),
  )

  router.get('/health', async (_req, res) => {
    const { getEhrbaseHealth } = await import('./ehrbaseClient.js')
    try {
      const h = await getEhrbaseHealth()
      res.json({ ok: true, ehrbase: h })
    } catch (e) {
      res.json({ ok: false, error: String(e?.message ?? e) })
    }
  })

  return router
}
