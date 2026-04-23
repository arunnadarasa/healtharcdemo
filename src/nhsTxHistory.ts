import type { NhsNetwork } from './nhsSession'

export type WalletMode = 'metamask' | 'circle'

export type NhsTxItem = {
  /** On-chain receipt (`0x…`) or synthetic `audit:…` id when no on-chain receipt was returned */
  txHash: string
  network: NhsNetwork
  endpoint: string
  createdAt: string
  kind?: 'chain' | 'audit'
  /** Entity id from API body when `kind` is audit */
  auditRef?: string
  /** Human-readable list price for this paid call (e.g. gate amount), when known */
  paidDisplay?: string
  /** Wallet mode active when the paid call was made */
  walletMode?: WalletMode
}

const KEY = 'nhs_tx_history_v1'

export function listNhsTxHistory(): NhsTxItem[] {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as NhsTxItem[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.txHash === 'string' && typeof item.network === 'string')
      .map((item) => ({
        ...item,
        kind:
          item.kind ??
          (typeof item.txHash === 'string' && item.txHash.startsWith('0x') ? 'chain' : 'audit'),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

export function addNhsTxHistory(item: NhsTxItem) {
  const prev = listNhsTxHistory()
  const deduped = prev.filter((p) => !(p.txHash === item.txHash && p.network === item.network))
  const next = [item, ...deduped].slice(0, 500)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function clearNhsTxHistory() {
  localStorage.removeItem(KEY)
}

/** Paid neighbourhood + OpenEHR + HES scale routes (x402 $0.01). */
const NEIGHBOURHOOD_PAID_ENDPOINTS = new Set([
  '/api/openehr/query/aql',
  '/api/neighbourhood/insights/lsoa',
  '/api/neighbourhood/insights/summary',
  '/api/neighbourhood/scale/search',
  '/api/neighbourhood/uk/search',
  '/api/neighbourhood/uk/synthesis',
  '/api/neighbourhood/scale/cross-summary',
])

/** Insights page only (excludes HES scale explorer paid calls). */
const NEIGHBOURHOOD_INSIGHTS_ONLY = new Set([
  '/api/openehr/query/aql',
  '/api/neighbourhood/insights/lsoa',
  '/api/neighbourhood/insights/summary',
])

const HES_SCALE_ENDPOINTS = new Set([
  '/api/neighbourhood/scale/search',
  '/api/neighbourhood/uk/search',
  '/api/neighbourhood/uk/synthesis',
  '/api/neighbourhood/scale/cross-summary',
])

const DMD_ENDPOINTS = new Set(['/api/dmd/lookup', '/api/dmd/summary'])

/** Server gate price for those routes (`server/neighbourhood/router.js`, `server/openehr/bffRouter.js`). */
export const NEIGHBOURHOOD_X402_PRICE_DISPLAY = '$0.01'

export function paidDisplayForNeighbourhoodEndpoint(endpoint: string): string | undefined {
  if (NEIGHBOURHOOD_PAID_ENDPOINTS.has(endpoint)) return NEIGHBOURHOOD_X402_PRICE_DISPLAY
  if (DMD_ENDPOINTS.has(endpoint)) return NEIGHBOURHOOD_X402_PRICE_DISPLAY
  return undefined
}

export function listNhsTxHistoryNeighbourhoodInsights(network: NhsNetwork): NhsTxItem[] {
  return listNhsTxHistory().filter(
    (row) => row.network === network && NEIGHBOURHOOD_INSIGHTS_ONLY.has(row.endpoint),
  )
}

export function listNhsTxHistoryHesScale(network: NhsNetwork): NhsTxItem[] {
  return listNhsTxHistory().filter(
    (row) => row.network === network && HES_SCALE_ENDPOINTS.has(row.endpoint),
  )
}

export function listNhsTxHistoryDmd(network: NhsNetwork): NhsTxItem[] {
  return listNhsTxHistory().filter((row) => row.network === network && DMD_ENDPOINTS.has(row.endpoint))
}

export function explorerUrl(_network: NhsNetwork, txHash: string): string | null {
  if (!txHash.startsWith('0x')) return null
  return `https://testnet.arcscan.app/tx/${txHash}`
}

/** Wallet account page on Arc explorer (useful when there is no `/tx/0x…` for audit-only rows). */
export function explorerAddressUrl(_network: NhsNetwork, walletAddress: string): string | null {
  const w = walletAddress.trim().toLowerCase()
  if (!/^0x[a-f0-9]{8,}$/i.test(w)) return null
  return `https://testnet.arcscan.app/address/${w}`
}
