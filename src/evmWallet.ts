import { custom, fallback, http, parseUnits, type Transport } from 'viem'

/** Typical 6-decimal stable-style tokens in TIP-20 style flows. */
export const TIP20_DECIMALS = 6

/**
 * Some x402 session flows need an explicit deposit cap. Override via Vite: `VITE_X402_SESSION_MAX_DEPOSIT`.
 */
function sessionMaxDepositHuman(): string {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined
  const next = env?.VITE_X402_SESSION_MAX_DEPOSIT?.trim()
  return next || '50'
}

export const X402_SESSION_MAX_DEPOSIT = sessionMaxDepositHuman()

const base64UrlDecode = (value: string) => {
  const s = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return atob(s + pad)
}

/**
 * Parse `suggestedDeposit` (raw integer string) from an x402 `WWW-Authenticate` header
 * (`request="..."` base64url JSON), after the server normalizes the challenge.
 */
export function parseSuggestedDepositRawFromWwwAuthenticate(wwwAuthenticate: string): bigint | null {
  const match = wwwAuthenticate.match(/request="([^"]+)"/)
  if (!match?.[1]) return null
  let decoded: unknown
  try {
    decoded = JSON.parse(base64UrlDecode(match[1]))
  } catch {
    return null
  }
  const raw = (decoded as { request?: { suggestedDeposit?: string } })?.request?.suggestedDeposit
  if (typeof raw !== 'string' || !raw.length) return null
  try {
    return BigInt(raw)
  } catch {
    return null
  }
}

/** `maxDeposit` as raw units (6 decimals). */
export function x402SessionMaxDepositRaw(): bigint {
  return parseUnits(X402_SESSION_MAX_DEPOSIT, TIP20_DECIMALS)
}

/**
 * Deposit size the session opener will use: `min(suggestedDeposit, maxDeposit)` when both exist.
 */
export function sessionDepositRequiredRaw(suggestedDepositRaw: bigint | null): bigint {
  const cap = x402SessionMaxDepositRaw()
  if (suggestedDepositRaw !== null) {
    return suggestedDepositRaw < cap ? suggestedDepositRaw : cap
  }
  return cap
}

/** Human-readable USDC-style amount from 6-decimal raw units. */
export function formatTip20Usdc(raw: bigint): string {
  const n = Number(raw) / 10 ** TIP20_DECIMALS
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

const TIP20_INSUFFICIENT_RE = /available:\s*(\d+),\s*required:\s*(\d+)/i

/** Parse on-chain revert text from TIP-20 `InsufficientBalance`. */
export function parseTip20InsufficientBalance(message: string): { available: bigint; required: bigint } | null {
  const m = message.match(TIP20_INSUFFICIENT_RE)
  if (!m) return null
  try {
    return { available: BigInt(m[1]), required: BigInt(m[2]) }
  } catch {
    return null
  }
}

function toBigIntish(v: unknown): bigint | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'bigint') return v
  if (typeof v === 'string' && v.startsWith('0x')) {
    try {
      return BigInt(v)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Some wallets build EIP-1559 txs with `maxPriorityFeePerGas: 0`, which a few RPCs reject.
 * Nudge priority fee to 1 wei when it is zero but `maxFeePerGas` is non-zero.
 */
export function patchEip1559GasFields(tx: Record<string, unknown>): Record<string, unknown> {
  const out = { ...tx }
  const mf = toBigIntish(out.maxFeePerGas)
  const mp = toBigIntish(out.maxPriorityFeePerGas)
  if (mf !== null && mf > 0n && mp !== null && mp === 0n) {
    out.maxPriorityFeePerGas = '0x1'
  }
  return out
}

function patchJsonRpcGasParams(args: { method: string; params?: unknown[] }): { method: string; params?: unknown[] } {
  const { method, params } = args
  if (!params?.length) return args
  if (method === 'eth_estimateGas' || method === 'eth_sendTransaction') {
    const first = params[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return {
        ...args,
        params: [patchEip1559GasFields(first as Record<string, unknown>), ...params.slice(1)],
      }
    }
  }
  return args
}

function wrapTransportWithGasPatch(transport: Transport): Transport {
  return (opts) => {
    const t = transport(opts)
    const request = t.request.bind(t)
    return {
      ...t,
      request: async (args) =>
        request(
          patchJsonRpcGasParams(args as { method: string; params?: unknown[] }) as typeof args,
        ),
    }
  }
}

/** @deprecated Unused; kept for compatibility if imported elsewhere. */
export function appendPaymentHints(message: string): string {
  const tip20 = parseTip20InsufficientBalance(message)
  if (tip20) {
    const { available, required } = tip20
    return (
      `${message}\n\n` +
      `USDC-style balance issue: you have ~${formatTip20Usdc(available)} but the flow needs ~${formatTip20Usdc(required)}. ` +
      `Fund the wallet on the selected chain, reduce VITE_X402_SESSION_MAX_DEPOSIT if allowed, or use a server API key where configured.`
    )
  }

  const lower = message.toLowerCase()
  const looksGasy =
    lower.includes('estimate gas') ||
    lower.includes('internal json-rpc') ||
    lower.includes('json-rpc error') ||
    (lower.includes('gas') && lower.includes('estimate'))
  if (!looksGasy) return message
  return (
    `${message}\n\n` +
    `Hints: ensure the wallet is on the right network and funded; try another browser wallet if gas estimation fails; or configure a server-side API key to skip wallet payment where supported.`
  )
}

/** EIP-1193 provider from `window.ethereum` (typed for viem `custom`). */
export type BrowserEthereumProvider = Parameters<typeof custom>[0]

/**
 * Route public-chain reads through HTTP RPC first, then fall back to the injected wallet for signing.
 */
export function browserWalletTransport(
  ethereum: BrowserEthereumProvider,
  /** Must match the wallet `chain` (mainnet vs testnet). */
  publicRpcHttpUrl: string,
): Transport {
  return wrapTransportWithGasPatch(fallback([http(publicRpcHttpUrl), custom(ethereum)]))
}
