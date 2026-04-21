/** Circle Modular Wallets JSON-RPC — same pattern as DanceArc (proxy avoids CORS on localhost). */

export const DEFAULT_CIRCLE_MODULAR_CLIENT_URL = 'https://modular-sdk.circle.com'

export function resolveModularClientUrl(): string {
  const explicit = import.meta.env.VITE_CIRCLE_MODULAR_CLIENT_URL?.trim()
  if (explicit) return explicit
  /**
   * Localhost default: same-origin `/api/circle-modular` — avoids browser **CORS** (“Failed to fetch”) on direct modular-sdk.
   * Direct SDK URL: set `VITE_CIRCLE_MODULAR_DIRECT=1` (only if Circle allows your origin in CORS).
   */
  const direct =
    import.meta.env.VITE_CIRCLE_MODULAR_DIRECT === 'true' ||
    import.meta.env.VITE_CIRCLE_MODULAR_DIRECT === '1'
  if (typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1') {
      if (direct) return DEFAULT_CIRCLE_MODULAR_CLIENT_URL
      return `${window.location.origin}/api/circle-modular`
    }
  }
  return DEFAULT_CIRCLE_MODULAR_CLIENT_URL
}

export function getCircleModularConfig(): { clientUrl: string; clientKey: string } | null {
  const clientKey = import.meta.env.VITE_CIRCLE_CLIENT_KEY?.trim()
  const clientUrl = resolveModularClientUrl()
  if (!clientKey) return null
  return { clientUrl, clientKey }
}

/** Local demo only — live JSON-RPC to modular-sdk is often blocked (Cloudflare / CORS). */
export function isCircleModularMock(): boolean {
  return (
    import.meta.env.VITE_CIRCLE_MODULAR_MOCK === 'true' || import.meta.env.VITE_CIRCLE_MODULAR_MOCK === '1'
  )
}

type JsonRpcResponse = {
  jsonrpc?: string
  id?: string
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

async function circleModularJsonRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const c = getCircleModularConfig()
  if (!c) throw new Error('Set VITE_CIRCLE_CLIENT_KEY in .env')

  const appUri = typeof window !== 'undefined' ? window.location.origin : 'unknown'
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}`

  let res: Response
  try {
    res = await fetch(c.clientUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${c.clientKey}`,
        'X-AppInfo': `platform=web;version=1.0.13;uri=${appUri}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isCrossOriginModular =
      c.clientUrl.startsWith('https://modular-sdk.circle.com') ||
      c.clientUrl.startsWith('http://modular-sdk.circle.com')
    if (isCrossOriginModular && /fetch|network|Failed|Load failed|CORS/i.test(msg)) {
      throw new Error(
        `${msg} — Browser cannot call modular-sdk directly from this origin (CORS). ` +
          `Unset VITE_CIRCLE_MODULAR_DIRECT and use the default same-origin /api/circle-modular proxy, or see Circle Modular Web SDK docs.`,
      )
    }
    throw e instanceof Error ? e : new Error(msg)
  }

  const text = await res.text()
  let json: JsonRpcResponse
  try {
    json = JSON.parse(text) as JsonRpcResponse
  } catch {
    throw new Error(`Circle Modular: non-JSON (HTTP ${res.status}): ${text.slice(0, 500)}`)
  }

  if (json.error) {
    const e = json.error
    const msg = e.message != null && String(e.message).trim() !== '' ? String(e.message) : '(no message)'
    throw new Error(msg)
  }

  if (json.result === undefined) {
    throw new Error(`Circle Modular: unexpected JSON ${JSON.stringify(json).slice(0, 400)}`)
  }

  return json.result as T
}

export async function pingCircleModularRpc(): Promise<{ chainId: number; blockNumber?: bigint }> {
  if (isCircleModularMock()) {
    return { chainId: 5042002, blockNumber: 1n }
  }
  const hex = await circleModularJsonRpc<string>('eth_chainId', [])
  const chainId = Number.parseInt(hex, 16)
  let blockNumber: bigint | undefined
  try {
    const bnHex = await circleModularJsonRpc<string>('eth_blockNumber', [])
    blockNumber = BigInt(bnHex)
  } catch {
    /* optional */
  }
  return { chainId, blockNumber }
}
