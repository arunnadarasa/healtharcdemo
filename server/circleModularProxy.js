/**
 * Circle Modular Wallets JSON-RPC proxy (same-origin POST /api/circle-modular → modular-sdk.circle.com).
 * Must be registered before express.json() so the raw body forwards verbatim.
 * @see DanceArc server/index.js
 */

import express from 'express'

const DEFAULT_MODULAR_SDK_URL = 'https://modular-sdk.circle.com'

function normalizeCircleModularResponseBody(text, status) {
  const t = (text ?? '').trim()
  if (!t) {
    return JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: status === 403 ? -32003 : -32603,
        message: `Circle Modular returned an empty body (HTTP ${status}). In Circle Console, allow this app origin (e.g. localhost) for your Client Key and confirm the key is correct.`,
      },
    })
  }
  try {
    JSON.parse(t)
    return t
  } catch {
    const lockout = /lockout/i.test(t) || /<title>\s*Lockout/i.test(t)
    const hint = lockout
      ? 'HTTP 403 Lockout (Cloudflare). Server-side calls to modular-sdk are blocked; this is upstream, not your Client Key alone. For a green demo use VITE_CIRCLE_MODULAR_MOCK=1. x402 Gateway + EHRbase are unaffected.'
      : 'Response was not JSON — check Client Key, domain allowlist, or upstream errors.'
    return JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: status === 403 ? -32003 : -32603,
        message: `Circle Modular proxy (HTTP ${status}): ${hint}`,
        data: t.slice(0, 400),
      },
    })
  }
}

function enrichCircleModularRpcBody(bodyStr, httpStatus) {
  try {
    const j = JSON.parse(bodyStr)
    if (!j || typeof j !== 'object' || j.error == null || typeof j.error !== 'object') return bodyStr
    const err = j.error
    const m = err.message
    if (m !== undefined && m !== null && String(m).trim() !== '') return bodyStr
    const code = err.code
    err.message = `Circle Modular returned an RPC error with no message (HTTP ${httpStatus}${code !== undefined ? `, code ${code}` : ''}). Check Client Key and allowed domain in Circle Console.`
    return JSON.stringify(j)
  } catch {
    return bodyStr
  }
}

function buildCircleModularProxyHeaders(req) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const auth = req.get('authorization')
  if (typeof auth === 'string' && auth.length > 0) headers.Authorization = auth

  const appInfo = req.get('x-appinfo')
  if (typeof appInfo === 'string' && appInfo.length > 0) headers['X-AppInfo'] = appInfo

  const ua = req.get('user-agent')
  headers['User-Agent'] =
    typeof ua === 'string' && ua.length > 0
      ? ua
      : 'Mozilla/5.0 (compatible; ClinicalArc/1.0; +https://github.com/)'

  const al = req.get('accept-language')
  headers['Accept-Language'] = typeof al === 'string' && al.length > 0 ? al : 'en-US,en;q=0.9'

  /** Do not forward Sec-Fetch-* from Node; upstream may treat it as spoofed browser traffic. */

  const origin = req.get('origin')
  if (typeof origin === 'string' && origin.length > 0) {
    /** Circle Client Key "Allowed Domain" for web is often `localhost` with no port (Console UI). */
    const circleOrigin = (() => {
      try {
        const u = new URL(origin)
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          return `${u.protocol}//${u.hostname}`
        }
        return origin
      } catch {
        return origin
      }
    })()

    /** Origin only; omit Referer to upstream (sending Referer can still yield 403). */
    headers.Origin = circleOrigin
  }

  return headers
}

/**
 * @param {import('express').Express} app
 */
export function mountCircleModularProxy(app) {
  app.post(
    '/api/circle-modular',
    express.raw({ type: '*/*', limit: '2mb' }),
    async (req, res) => {
      const target = (process.env.CIRCLE_MODULAR_SDK_URL || DEFAULT_MODULAR_SDK_URL).trim()
      try {
        const rawBody =
          Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body.toString('utf8') : '{}'
        const outboundHeaders = buildCircleModularProxyHeaders(req)
        const upstream = await fetch(target, {
          method: 'POST',
          headers: outboundHeaders,
          body: rawBody,
        })
        const text = await upstream.text()
        let body = normalizeCircleModularResponseBody(text, upstream.status)
        body = enrichCircleModularRpcBody(body, upstream.status)
        res.status(upstream.status).setHeader('Content-Type', 'application/json; charset=utf-8').send(body)
      } catch (err) {
        console.error('circle-modular proxy', err)
        res.status(502).json({ error: 'proxy_failed', message: String(err?.message ?? err) })
      }
    },
  )
}
