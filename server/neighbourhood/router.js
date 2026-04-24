import express from 'express'
import { withArcGatewayGate } from '../nhs/payment.js'
import {
  aggregateAeByLsoa,
  aggregateCrossDatasetSummary,
  getAllIngestMeta,
  hesDbFileStats,
  hesStats,
  searchHesFts,
  searchHesPrefix,
} from './hesDb.js'
import { searchNhsUkCsv, selectNhsUkCsvContext } from './nhsUkCsvSearch.js'

function emptySearchHint(dataset, rowCount, stats) {
  if (rowCount > 0) return null
  if (dataset === 'op' && stats.opRows === 0) {
    return 'No OP rows in SQLite. Ingest outpatient CSVs: set HES_OP_DIR and run npm run ingest:hes (see README).'
  }
  if (dataset === 'apc' && stats.apcRows === 0) {
    return 'No APC rows in SQLite. Ingest admitted-patient CSVs: set HES_APC_DIR and run npm run ingest:hes.'
  }
  if (dataset === 'ae' && stats.aeRows === 0) {
    return 'No AE rows in SQLite. Set HES_AE_DIR (or HES_SAMPLE_DIR) and run npm run ingest:hes.'
  }
  if (stats.aeRows === 0 && stats.opRows === 0 && stats.apcRows === 0) {
    return 'HES tables are empty — run ingest:hes after pointing env vars at your NHS Digital artificial data folders.'
  }
  if (dataset === 'all' && stats.ftsRows === 0 && stats.aeRows + stats.opRows + stats.apcRows > 0) {
    return 'FTS index is empty but base tables have rows — run npm run hes:rebuild-fts, then search again.'
  }
  return 'No rows matched this query in the selected dataset. Try a longer LSOA (e.g. E01010560), use "all datasets", or confirm your ingest included this care setting.'
}
import { getEhrbaseHealth } from '../openehr/ehrbaseClient.js'
import { getIntegrationContext, snomedReferencesWithUrls } from './snomedContext.js'

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
    res.json({
      ok: true,
      hackathon: getIntegrationContext(),
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
      const dbFile = hesDbFileStats()
      const ingestMeta = getAllIngestMeta()
      res.json({
        ok: true,
        sqlite: stats,
        dbFile,
        ingestMeta,
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

  router.post(
    '/scale/search',
    ...gate(
      {
        enabled: paymentGateEnabled,
        amount: '0.01',
      },
      (req, res, paymentCtx) => {
        const { q, dataset, limit, offset, mode } = req.body ?? {}
        const ds = ['ae', 'op', 'apc', 'all'].includes(dataset) ? dataset : 'all'
        const lim = Math.min(200, Math.max(1, Number(limit) || 20))
        const off = Math.max(0, Number(offset) || 0)
        const m = mode === 'prefix' || mode === 'fts' || mode === 'auto' ? mode : 'auto'
        try {
          let rows = []
          let searchMode = 'fts'
          if (m === 'prefix') {
            rows = searchHesPrefix(q, ds, lim).rows
            searchMode = 'prefix'
          } else if (m === 'fts') {
            rows = searchHesFts({ q, dataset: ds, limit: lim, offset: off }).rows
            searchMode = 'fts'
          } else {
            const fts = searchHesFts({ q, dataset: ds, limit: lim, offset: off })
            rows = fts.rows
            if (rows.length === 0 && typeof q === 'string' && q.trim()) {
              rows = searchHesPrefix(q, ds, lim).rows
              searchMode = 'prefix'
            }
          }
          const tableCounts = hesStats()
          const emptyHint = emptySearchHint(ds, rows.length, tableCounts)
          return res.json({
            ok: true,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            q: typeof q === 'string' ? q : '',
            dataset: ds,
            searchMode,
            rows,
            tableCounts,
            emptyHint,
            disclaimer: 'Synthetic artificial HES — demo search only.',
          })
        } catch (e) {
          return res.status(400).json({
            error: String(e?.message ?? e),
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
          })
        }
      },
    ),
  )

  router.post(
    '/uk/search',
    ...gate(
      {
        enabled: paymentGateEnabled,
        amount: '0.01',
      },
      async (req, res, paymentCtx) => {
        const { q, dataset, limit, offset, mode } = req.body ?? {}
        try {
          const result = await searchNhsUkCsv({ q, dataset, limit, offset, mode })
          return res.json({
            ok: true,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            q: typeof q === 'string' ? q : '',
            dataset: result.dataset,
            searchMode: result.searchMode,
            total: result.total,
            rows: result.rows,
            disclaimer: 'Generated NHS UK text dataset search — demo only, not clinical advice.',
          })
        } catch (e) {
          return res.status(400).json({
            error: String(e?.message ?? e),
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
          })
        }
      },
    ),
  )

  router.post(
    '/uk/synthesis',
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
        const { dataset, query, focus, audience, maxContextRows } = req.body ?? {}
        const ds = typeof dataset === 'string' ? dataset : 'nhs_qa'
        const q = typeof query === 'string' ? query.trim() : ''
        const goal = typeof focus === 'string' ? focus.trim() : ''
        const aud = audience === 'clinician' || audience === 'patient' ? audience : 'patient'
        const contextRows = await selectNhsUkCsvContext({
          dataset: ds,
          query: q,
          maxRows: Number(maxContextRows) || 12,
        })

        const prompt = [
          'You are assisting with NHS UK synthetic OpenGPT-generated data. This is demo data only, not clinical advice.',
          `Audience: ${aud}.`,
          goal ? `Generation goal: ${goal}` : 'Generation goal: concise, safe, factual synthesis.',
          q ? `Primary query: ${q}` : 'Primary query: broad topic summary from selected dataset context.',
          'Use the context snippets below only as evidence and mention uncertainty where needed.',
          `Context (${contextRows.length} rows, dataset=${ds}): ${JSON.stringify(contextRows).slice(0, 14000)}`,
          'Return 5-8 bullet points and a short "Safety note".',
        ].join('\n')

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
              max_tokens: 700,
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
            dataset: ds,
            model,
            contextCount: contextRows.length,
            summary,
            disclaimer: 'Generated from synthetic NHS UK dataset snippets — not medical advice.',
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

  router.post(
    '/scale/cross-summary',
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
        const bundle = aggregateCrossDatasetSummary(filter || null)
        const snomedNote = snomedReferencesWithUrls()
          .map((r) => `${r.conceptId} ${r.term}`)
          .join('; ')
        const payload = JSON.stringify(bundle).slice(0, 12000)
        const prompt = `You are assisting with a DEMO on synthetic NHS artificial HES data (AE + OP + APC aggregates by LSOA, not real patients). Interoperability: openEHR + SNOMED framing. SNOMED examples: ${snomedNote}. Summarize in 5-8 bullet points for long-term population-health and neighbourhood planning impact, scalability of indexed SQLite + FTS search + per-API USDC nanopayments. Data (aggregates only): ${payload}. Say clearly this is synthetic administrative data and not clinical advice.`

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
              max_tokens: 700,
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
            bundlePreview: payload.slice(0, 2000),
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
