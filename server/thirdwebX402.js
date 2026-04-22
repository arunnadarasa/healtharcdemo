/**
 * thirdweb x402: createThirdwebClient + facilitator + settlePayment (Arc Testnet).
 * @see https://portal.thirdweb.com/x402/facilitator
 *
 * Env: X402_FACILITATOR=thirdweb, THIRDWEB_SECRET_KEY, optional THIRDWEB_SERVER_WALLET_ADDRESS
 * (defaults to X402_SELLER_ADDRESS). EIP-3009 exact flow — not Circle Gateway batching.
 */
import { createThirdwebClient } from 'thirdweb'
import { decodePayment, encodePayment, facilitator, settlePayment } from 'thirdweb/x402'
import { arcTestnet } from 'thirdweb/chains'
import * as x402Env from './x402Env.js'

export function isThirdwebX402Enabled() {
  return String(process.env.X402_FACILITATOR || '').toLowerCase().trim() === 'thirdweb'
}

/** True when Thirdweb settlePayment can run (secret present). */
export function isThirdwebSettlementConfigured() {
  return !!process.env.THIRDWEB_SECRET_KEY?.trim()
}

function thirdwebSecret() {
  const s = process.env.THIRDWEB_SECRET_KEY?.trim()
  if (!s) throw new Error('THIRDWEB_SECRET_KEY is required when X402_FACILITATOR=thirdweb')
  return s
}

function payTo() {
  return x402Env.x402SellerAddress()
}

/** Server wallet that executes settlements in thirdweb (dashboard); defaults to payee. */
function serverWalletAddress() {
  return process.env.THIRDWEB_SERVER_WALLET_ADDRESS?.trim() || payTo()
}

let _facilitator = null

function getThirdwebFacilitator() {
  if (_facilitator) return _facilitator
  const client = createThirdwebClient({ secretKey: thirdwebSecret() })
  _facilitator = facilitator({
    client,
    serverWalletAddress: serverWalletAddress(),
  })
  return _facilitator
}

function paymentDataFromReq(req) {
  const h = req.headers
  return (
    (typeof h['payment-signature'] === 'string' && h['payment-signature']) ||
    (typeof h['x-payment'] === 'string' && h['x-payment']) ||
    (typeof h['PAYMENT-SIGNATURE'] === 'string' && h['PAYMENT-SIGNATURE']) ||
    (typeof h['X-PAYMENT'] === 'string' && h['X-PAYMENT']) ||
    undefined
  )
}

/**
 * @x402 v2 payloads from `@x402/fetch` carry `scheme` / `network` on `accepted` (see PaymentPayload in @x402/core).
 * Thirdweb `decodePaymentRequest` matches only top-level `scheme` + `network` (thirdweb x402/common.js), so
 * otherwise valid signatures fail with "Unable to find matching payment requirements".
 */
function normalizePaymentDataForThirdwebSettle(paymentData) {
  if (paymentData == null || typeof paymentData !== 'string') return paymentData
  try {
    const decoded = decodePayment(paymentData)
    const accepted = decoded && typeof decoded === 'object' ? decoded.accepted : null
    if (
      accepted &&
      typeof accepted === 'object' &&
      accepted.scheme != null &&
      accepted.network != null &&
      (decoded.scheme == null || decoded.network == null)
    ) {
      return encodePayment({
        ...decoded,
        scheme: decoded.scheme ?? accepted.scheme,
        network: decoded.network ?? accepted.network,
      })
    }
  } catch {
    return paymentData
  }
  return paymentData
}

function resourceUrlFromReq(req) {
  // Prefer forwarded headers from Vite/nginx so the URL matches the browser (e.g. :5173), not the upstream API (:8787).
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim()
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim()
  const path = req.originalUrl || ''
  if (!host) return `${proto}://localhost${path}`
  return `${proto}://${host}${path}`
}

function waitUntilFromEnv() {
  const w = process.env.THIRDWEB_SETTLE_WAIT_UNTIL?.trim()
  if (w === 'simulated' || w === 'submitted' || w === 'confirmed') return w
  return 'submitted'
}

async function runSettlePayment(req, res, next, routeMeta) {
  const result = await settlePayment({
    resourceUrl: resourceUrlFromReq(req),
    method: req.method,
    paymentData: normalizePaymentDataForThirdwebSettle(paymentDataFromReq(req)),
    payTo: payTo(),
    network: arcTestnet,
    price: routeMeta.price,
    facilitator: getThirdwebFacilitator(),
    waitUntil: waitUntilFromEnv(),
    routeConfig: {
      description: routeMeta.description,
      mimeType: 'application/json',
    },
  })

  if (result.status === 200) {
    if (result.responseHeaders) {
      for (const [key, value] of Object.entries(result.responseHeaders)) {
        if (value != null) res.setHeader(key, String(value))
      }
    }
    return next()
  }

  res.status(result.status)
  if (result.responseHeaders) {
    for (const [key, value] of Object.entries(result.responseHeaders)) {
      if (value != null) res.setHeader(key, String(value))
    }
  }
  return res.json(result.responseBody ?? {})
}

/** Runs settlePayment when client chose Thirdweb (`req.nhsX402Facilitator === 'thirdweb'`). */
export function createNeighbourhoodThirdwebPaymentMiddleware() {
  if (!isThirdwebSettlementConfigured()) {
    return (_req, _res, next) => next()
  }
  return async (req, res, next) => {
    // #region agent log
    if (req.method === 'POST' && req.path === '/insights/lsoa') {
      fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
        body: JSON.stringify({
          sessionId: '8e1b23',
          runId: 'run-timeout-3',
          hypothesisId: 'V3',
          location: 'server/thirdwebX402.js:neighbourhood-middleware:entry',
          message: 'Entered thirdweb neighbourhood middleware',
          data: { facilitator: req.nhsX402Facilitator, path: req.path },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
    }
    // #endregion
    if (req.nhsX402Facilitator !== 'thirdweb') return next()
    if (req.method !== 'POST') return next()
    if (req.path === '/insights/lsoa') {
      return runSettlePayment(req, res, next, {
        price: '$0.01',
        description: 'Synthetic HES LSOA aggregates (demo)',
      })
    }
    if (req.path === '/insights/summary') {
      return runSettlePayment(req, res, next, {
        price: '$0.01',
        description: 'Featherless neighbourhood summary (demo)',
      })
    }
    if (req.path === '/scale/search') {
      return runSettlePayment(req, res, next, {
        price: '$0.01',
        description: 'HES FTS / prefix search at scale (demo)',
      })
    }
    if (req.path === '/scale/cross-summary') {
      return runSettlePayment(req, res, next, {
        price: '$0.01',
        description: 'Featherless AE+OP+APC cross-dataset summary (demo)',
      })
    }
    return next()
  }
}

export function createOpenehrThirdwebPaymentMiddleware() {
  if (!isThirdwebSettlementConfigured()) {
    return (_req, _res, next) => next()
  }
  return async (req, res, next) => {
    if (req.nhsX402Facilitator !== 'thirdweb') return next()
    if (req.method !== 'POST' || req.path !== '/query/aql') return next()
    return runSettlePayment(req, res, next, {
      price: '$0.01',
      description: 'OpenEHR AQL via EHRbase BFF (demo)',
    })
  }
}
