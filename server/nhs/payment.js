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
      return gateway.require(price)(req, res, () => {
        const pay = req.payment
        const ref = pay?.transaction ?? pay?.payer ?? null
        return handler(req, res, { paymentReceiptRef: ref, network: 'testnet' })
      })
    },
  ]
}
