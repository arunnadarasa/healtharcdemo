import express from 'express'
import { withArcGatewayGate } from '../nhs/payment.js'
import { aggregateAeByLsoa, hesStats } from './hesDb.js'
import { getEhrbaseHealth } from '../openehr/ehrbaseClient.js'
import { getIntegrationContext, snomedReferencesWithUrls } from './snomedContext.js'
import { getSnowstormStatus } from '../snomed/snowstormClient.js'

function nowIso() {
  return new Date().toISOString()
}

/**
 * @param {{ gateway: import('@circle-fin/x402-batching/server').GatewayMiddleware, skipInternalGateway?: boolean }} deps
 */
export function createNeighbourhoodRouter(deps) {
  const router = express.Router()
  const gate = (config, handler) => withArcGatewayGate(deps, config, handler)
  const paymentGateEnabled = process.env.NHS_ENABLE_PAYMENT_GATE !== 'false'

  router.get('/insights/context', async (_req, res) => {
    let snowstorm = { configured: false }
    try {
      snowstorm = await getSnowstormStatus()
    } catch (e) {
      snowstorm = { configured: false, reachable: false, error: String(e?.message ?? e) }
    }
    res.json({
      ok: true,
      hackathon: getIntegrationContext({ snowstorm }),
      time: nowIso(),
    })
  })

  router.get('/insights/health', async (_req, res) => {
    let ehrbase = {}
    try {
      ehrbase = await getEhrbaseHealth()
    } catch (e) {
      ehrbase = { reachable: false, error: String(e?.message ?? e) }
    }
    try {
      const stats = hesStats()
      res.json({
        ok: true,
        sqlite: stats,
        ehrbase,
        note: 'Artificial HES — not for clinical assurance; see README.',
        time: nowIso(),
      })
    } catch (e) {
      res.json({
        ok: true,
        sqlite: { error: String(e?.message ?? e) },
        ehrbase,
        time: nowIso(),
      })
    }
  })

  router.post(
    '/insights/lsoa',
    ...gate(
      {
        enabled: paymentGateEnabled,
        amount: '0.01',
      },
      (req, res, paymentCtx) => {
        const { lsoa } = req.body ?? {}
        const filter = typeof lsoa === 'string' ? lsoa.trim() : ''
        const rows = aggregateAeByLsoa(filter || null)
        res.json({
          ok: true,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
          filter: filter || null,
          rows,
          snomedCt: {
            note: 'Semantic hooks for interoperability demos — validate in SNOMED International Browser.',
            references: snomedReferencesWithUrls(),
          },
          disclaimer: 'Synthetic artificial HES — relationships between fields are not preserved.',
        })
      },
    ),
  )

  router.post(
    '/insights/summary',
    ...gate(
      {
        enabled: paymentGateEnabled,
        amount: '0.01',
      },
      async (req, res, paymentCtx) => {
        const key = process.env.FEATHERLESS_API_KEY?.trim()
        if (!key) {
          return res.status(503).json({
            error: 'FEATHERLESS_API_KEY not set on server.',
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
          })
        }
        const { lsoa } = req.body ?? {}
        const filter = typeof lsoa === 'string' ? lsoa.trim() : ''
        const rows = aggregateAeByLsoa(filter || null)
        const snomedNote = snomedReferencesWithUrls()
          .map((r) => `${r.conceptId} ${r.term}`)
          .join('; ')
        const prompt = `You are assisting with a DEMO on synthetic NHS artificial HES data (not real patients) for a neighbourhood health plan narrative. Interoperability: openEHR (EHRbase) holds structured clinical data; SNOMED CT provides semantic codes — example concepts for this story: ${snomedNote}. Summarize in 4-6 bullet points for a neighbourhood health team from the aggregates only. Data: ${JSON.stringify(rows).slice(0, 4000)}. Say clearly this is synthetic administrative data and not clinical advice.`

        /** Default: Qwen from Featherless quickstart — many Meta/Llama ids are HF-gated (`model_gated_needs_oauth`). */
        const model = process.env.FEATHERLESS_MODEL?.trim() || 'Qwen/Qwen2.5-7B-Instruct'
        const upstream = process.env.FEATHERLESS_API_URL?.trim() || 'https://api.featherless.ai/v1/chat/completions'

        try {
          const fr = await fetch(upstream, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 500,
            }),
          })
          const text = await fr.text()
          let json
          try {
            json = JSON.parse(text)
          } catch {
            json = { raw: text.slice(0, 2000) }
          }
          const summary =
            json?.choices?.[0]?.message?.content ??
            json?.choices?.[0]?.text ??
            (typeof json === 'string' ? json : JSON.stringify(json))
          return res.json({
            ok: fr.ok,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            summary,
            model,
            disclaimer: 'Not medical advice. Synthetic artificial HES only.',
          })
        } catch (e) {
          return res.status(502).json({
            error: String(e?.message ?? e),
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
          })
        }
      },
    ),
  )

  return router
}
