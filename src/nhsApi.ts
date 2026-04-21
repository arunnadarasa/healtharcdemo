import { nhsX402Fetch } from './nhsArcPaidFetch'
import { getAuthHeaders, type NhsNetwork, type NhsRole } from './nhsSession'
import { addNhsTxHistory, paidDisplayForNeighbourhoodEndpoint } from './nhsTxHistory'
import { getX402FacilitatorForPath, type X402FacilitatorId } from './x402FacilitatorPreference'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number }
type ApiSuccess<T> = { ok: true; data: T; txHash: string | null; explorerUrl: string | null }
type ApiFailure = { ok: false; error: string; status: number }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function appendDetail(base: string, reason: unknown): string {
  if (typeof reason === 'string' && reason.trim()) return `${base} (${reason.trim()})`
  return base
}

function errorFromResponse(
  res: Response,
  payload: unknown,
  ctx?: { facilitator?: X402FacilitatorId },
): string {
  const status = res.status
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    // Thirdweb x402 settlement failures often return { error, errorMessage, fundWalletLink }
    if (status === 402) {
      const em = o.errorMessage
      const err = o.error
      if (typeof em === 'string' && em.trim()) {
        return typeof err === 'string' && err.trim()
          ? `${err}: ${em}${typeof o.fundWalletLink === 'string' ? ` (${o.fundWalletLink})` : ''}`
          : em
      }
    }
    if (typeof o.error === 'string' && o.error) return appendDetail(o.error, o.reason)
    if (typeof o.details === 'string' && o.details) return o.details
    if (typeof o.message === 'string' && o.message) return appendDetail(o.message, o.reason)
  }
  if (typeof payload === 'string' && payload.trim()) {
    const lower = payload.slice(0, 80).toLowerCase()
    if (lower.includes('<!doctype') || lower.includes('<html')) {
      if (status === 502 || status === 503 || status === 504) {
        return 'API server not reachable. Run `npm run server` (port 8787) or `npm run dev:full` alongside the Vite dev server.'
      }
      return `Server returned HTML (HTTP ${status}). Check that the API is running on port 8787.`
    }
    return payload.replace(/\s+/g, ' ').slice(0, 240)
  }
  if (status === 402) {
    const thirdweb =
      ctx?.facilitator === 'thirdweb' ||
      (typeof import.meta.env.VITE_X402_FACILITATOR === 'string' &&
        import.meta.env.VITE_X402_FACILITATOR.toLowerCase().trim() === 'thirdweb')
    if (thirdweb) {
      return 'Payment required (402). Approve the wallet signature for the USDC (EIP-3009) x402 payment (Thirdweb facilitator on Arc). If this persists, confirm THIRDWEB_SECRET_KEY on the server and Arc testnet USDC in your wallet. Or set NHS_ENABLE_PAYMENT_GATE=false to skip the gate for local dev.'
    }
    return 'Payment required (402). Approve the wallet prompts for Circle Gateway deposit (if needed) and x402 payment, or set NHS_ENABLE_PAYMENT_GATE=false on the server to disable the gate for local dev.'
  }
  if (status === 503 && payload && typeof payload === 'object') {
    const msg = (payload as Record<string, unknown>).error
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'API server not reachable. Run `npm run server` (port 8787) or `npm run dev:full`.'
  }
  return `Request failed (HTTP ${status}).`
}

type ApiOpts = {
  network: NhsNetwork
}

/**
 * Full EVM tx hash: `0x` + 64 hex, or bare 64 hex (some facilitators omit the prefix).
 * Does not match 40-hex addresses.
 */
function extractTxHash(value: string): string | null {
  const prefixed = value.match(/0x[a-fA-F0-9]{64}/i)
  if (prefixed) return prefixed[0]
  const bare = value.match(/\b[a-fA-F0-9]{64}\b/i)
  return bare ? `0x${bare[0]}` : null
}

function toExplorerUrl(_network: NhsNetwork, txHash: string): string {
  return `https://testnet.arcscan.app/tx/${txHash}`
}

function auditRefFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const o = payload as Record<string, unknown>
  for (const k of ['id', 'patientId', 'referralId', 'alertId', 'planId']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function txFromResponse(payload: unknown, res: Response): string | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    if (typeof o.receiptRef === 'string' && o.receiptRef.trim()) {
      const fromReceipt = extractTxHash(o.receiptRef)
      if (fromReceipt) return fromReceipt
    }
  }
  const paymentReceipt = res.headers.get('payment-receipt') || ''
  const payment = res.headers.get('payment') || ''
  const payloadString = (() => {
    try {
      return JSON.stringify(payload ?? {})
    } catch {
      return ''
    }
  })()
  const merged = [paymentReceipt, payment, payloadString].filter(Boolean).join(' ')

  const fromMerged = extractTxHash(merged)
  if (fromMerged) return fromMerged

  // Fallback: parse serialized receipt payloads and look for a reference field.
  for (const candidate of [paymentReceipt, payment]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const reference = parsed.reference
      if (typeof reference === 'string') {
        const fromReference = extractTxHash(reference)
        if (fromReference) return fromReference
      }
    } catch {
      // Ignore non-JSON header values.
    }
  }
  return null
}

export async function apiPost<T>(
  path: string,
  role: NhsRole,
  wallet: string,
  body: unknown,
  opts: ApiOpts,
): Promise<ApiResponse<T>> {
  const facilitator = getX402FacilitatorForPath(path)
  const headers = new Headers(getAuthHeaders(role, wallet))
  headers.set('X-X402-Facilitator', facilitator)
  const reqInit: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...(body as Record<string, unknown>), network: opts.network }),
  }
  let res: Response
  try {
    res = await nhsX402Fetch(path, reqInit, { wallet, network: opts.network, facilitator })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Network error.'
    return { ok: false, error: msg, status: 0 }
  }
  const payload = await parseJsonSafe(res)
  if (!res.ok)
    return { ok: false, error: errorFromResponse(res, payload, { facilitator }), status: res.status }
  const txHash = txFromResponse(payload, res)
  const paidDisplay = paidDisplayForNeighbourhoodEndpoint(path)
  const paidFields = paidDisplay ? { paidDisplay } : {}
  if (txHash) {
    addNhsTxHistory({
      txHash,
      network: opts.network,
      endpoint: path,
      createdAt: new Date().toISOString(),
      kind: 'chain',
      ...paidFields,
    })
  } else {
    const auditRef = auditRefFromPayload(payload)
    addNhsTxHistory({
      txHash: `audit:${crypto.randomUUID()}`,
      network: opts.network,
      endpoint: path,
      createdAt: new Date().toISOString(),
      kind: 'audit',
      ...(auditRef ? { auditRef } : {}),
      ...paidFields,
    })
  }
  return {
    ok: true,
    data: payload as T,
    txHash,
    explorerUrl: txHash ? toExplorerUrl(opts.network, txHash) : null,
  }
}

export async function apiGet<T>(
  path: string,
  role: NhsRole,
  wallet: string,
  _opts: ApiOpts,
): Promise<ApiResponse<T>> {
  void _opts
  let res: Response
  try {
    res = await fetch(path, { headers: getAuthHeaders(role, wallet) })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Network error.'
    return { ok: false, error: msg, status: 0 }
  }
  const payload = await parseJsonSafe(res)
  if (!res.ok) return { ok: false, error: errorFromResponse(res, payload), status: res.status }
  return { ok: true, data: payload as T, txHash: null, explorerUrl: null }
}

