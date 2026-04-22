import express from 'express'
import { withArcGatewayGate } from '../nhs/payment.js'

function nowIso() {
  return new Date().toISOString()
}

function getDmdServiceBaseUrl() {
  return process.env.DMD_SERVICE_URL?.trim() || ''
}

async function fetchJson(url, init = {}, timeoutMs = 12000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(id)
  }
}

async function searchDmd(baseUrl, q, code) {
  const cleanCode = typeof code === 'string' ? code.trim() : ''
  if (cleanCode) {
    const productUrl = `${baseUrl.replace(/\/$/, '')}/dmd/v1/product/${encodeURIComponent(cleanCode)}`
    return fetchJson(productUrl, { method: 'GET' })
  }
  const cleanQ = typeof q === 'string' ? q.trim() : ''
  const searchUrl = `${baseUrl.replace(/\/$/, '')}/dmd/v1/search?s=${encodeURIComponent(cleanQ)}`
  return fetchJson(searchUrl, { method: 'GET' })
}

/**
 * @param {{ gateway: import('@circle-fin/x402-batching/server').GatewayMiddleware, skipInternalGateway?: boolean|((req:any)=>boolean) }} deps
 */
export function createDmdRouter(deps) {
  const router = express.Router()
  const gate = (config, handler) => withArcGatewayGate(deps, config, handler)
  const paymentGateEnabled = process.env.NHS_ENABLE_PAYMENT_GATE !== 'false'

  router.get('/health', async (_req, res) => {
    const baseUrl = getDmdServiceBaseUrl()
    if (!baseUrl) {
      return res.status(200).json({
        ok: false,
        configured: false,
        service: 'dm+d',
        hint: 'Set DMD_SERVICE_URL (e.g. http://localhost:8082) to proxy wardle/dmd endpoints.',
        time: nowIso(),
      })
    }
    const probe = await fetchJson(`${baseUrl.replace(/\/$/, '')}/dmd/v1/lookup/BASIS_OF_NAME`, { method: 'GET' }, 10000)
    return res.status(200).json({
      ok: probe.ok,
      configured: true,
      service: 'dm+d',
      upstream: baseUrl,
      upstreamStatus: probe.status,
      time: nowIso(),
    })
  })

  router.get('/search', async (req, res) => {
    const baseUrl = getDmdServiceBaseUrl()
    if (!baseUrl) {
      return res.status(200).json({
        ok: false,
        configured: false,
        hint: 'DMD_SERVICE_URL is not set; search is unavailable.',
        rows: [],
      })
    }
    try {
      const result = await searchDmd(baseUrl, req.query.q, req.query.code)
      return res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        configured: true,
        upstream: baseUrl,
        query: typeof req.query.q === 'string' ? req.query.q : '',
        code: typeof req.query.code === 'string' ? req.query.code : '',
        data: result.data,
      })
    } catch (e) {
      return res.status(502).json({
        ok: false,
        configured: true,
        upstream: baseUrl,
        error: String(e?.message ?? e),
      })
    }
  })

  router.post(
    '/lookup',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const baseUrl = getDmdServiceBaseUrl()
        if (!baseUrl) {
          return res.status(503).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: 'DMD_SERVICE_URL is not set on server.',
          })
        }
        try {
          const result = await searchDmd(baseUrl, req.body?.q, req.body?.code)
          return res.status(result.ok ? 200 : 502).json({
            ok: result.ok,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            upstream: baseUrl,
            query: typeof req.body?.q === 'string' ? req.body.q : '',
            code: typeof req.body?.code === 'string' ? req.body.code : '',
            result: result.data,
          })
        } catch (e) {
          return res.status(502).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: String(e?.message ?? e),
          })
        }
      },
    ),
  )

  router.post(
    '/summary',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const baseUrl = getDmdServiceBaseUrl()
        const key = process.env.FEATHERLESS_API_KEY?.trim()
        if (!baseUrl) {
          return res.status(503).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: 'DMD_SERVICE_URL is not set on server.',
          })
        }
        if (!key) {
          return res.status(503).json({
            ok: false,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            error: 'FEATHERLESS_API_KEY not set on server.',
          })
        }
        try {
          const lookup = await searchDmd(baseUrl, req.body?.q, req.body?.code)
          const model = process.env.FEATHERLESS_MODEL?.trim() || 'Qwen/Qwen2.5-7B-Instruct'
          const upstream = process.env.FEATHERLESS_API_URL?.trim() || 'https://api.featherless.ai/v1/chat/completions'
          const prompt = `You are assisting with a UK dm+d prescribing intelligence demo. Summarize in 4-6 bullet points for product/clinical informatics users. Include: product identity, class relationship hints (VTM/VMP/AMP when available), and one caution that this is demo output not clinical advice. Input: ${JSON.stringify(lookup.data).slice(0, 12000)}`
          const llm = await fetchJson(
            upstream,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 450,
              }),
            },
            25000,
          )
          const summary =
            llm?.data?.choices?.[0]?.message?.content ??
            llm?.data?.choices?.[0]?.text ??
            (typeof llm?.data === 'string' ? llm.data : JSON.stringify(llm?.data))
          return res.status(llm.ok ? 200 : 502).json({
            ok: llm.ok,
            receiptRef: paymentCtx.paymentReceiptRef ?? null,
            summary,
            model,
            sourceOk: lookup.ok,
            disclaimer: 'Demo output only. Not clinical advice.',
          })
        } catch (e) {
          return res.status(502).json({
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
