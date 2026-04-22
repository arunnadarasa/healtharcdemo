/**
 * Wraps route handlers with optional Circle Gateway x402 gate (Arc Testnet).
 * When `skipInternalGateway` is true (or `(req) => true`), the handler runs without `gateway.require`
 * (e.g. thirdweb `settlePayment` middleware already settled). Supports a function for per-request choice.
 */
export function withArcGatewayGate({ gateway, skipInternalGateway }, config, handler) {
  const {
    enabled = false,
    amount = '0.01',
  } = config || {}

  const price = typeof amount === 'string' && amount.startsWith('$') ? amount : `$${amount}`

  function skipFor(req) {
    if (typeof skipInternalGateway === 'function') return skipInternalGateway(req)
    return !!skipInternalGateway
  }

  if (!enabled) {
    return [
      (req, res) => {
        return handler(req, res, { paymentReceiptRef: null, network: 'testnet' })
      },
    ]
  }

  return [
    (req, res, next) => {
      if (skipFor(req)) {
        return handler(req, res, { paymentReceiptRef: null, network: 'testnet' })
      }
      // #region agent log
      fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
        body: JSON.stringify({
          sessionId: '8e1b23',
          runId: 'run-timeout-3',
          hypothesisId: 'V1_V2',
          location: 'server/nhs/payment.js:gateway-require:start',
          message: 'Entering gateway.require middleware',
          data: { path: req.path, price },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      res.on('close', () => {
        // #region agent log
        fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
          body: JSON.stringify({
            sessionId: '8e1b23',
            runId: 'run-timeout-3',
            hypothesisId: 'V2',
            location: 'server/nhs/payment.js:gateway-require:res-close',
            message: 'Response closed while in/after gateway.require',
            data: { path: req.path, headersSent: res.headersSent, writableEnded: res.writableEnded },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
      })
      return gateway.require(price)(req, res, () => {
        // #region agent log
        fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
          body: JSON.stringify({
            sessionId: '8e1b23',
            runId: 'run-timeout-3',
            hypothesisId: 'V1',
            location: 'server/nhs/payment.js:gateway-require:success-callback',
            message: 'gateway.require invoked success callback',
            data: { path: req.path },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        const pay = req.payment
        const ref = pay?.transaction ?? pay?.payer ?? null
        return handler(req, res, { paymentReceiptRef: ref, network: 'testnet' })
      })
    },
  ]
}
