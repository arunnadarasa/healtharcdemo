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
  /** Runner evidence mode when recorded from on-chain runner */
  runnerMode?: 'direct_onchain_transfer' | 'x402_circle_nanopayments'
  /** Attempt number in runner execution */
  attemptIndex?: number
  /** Batch number in runner execution */
  batchIndex?: number
  /** Attempt-level payment state in runner logs */
  paymentStatus?: 'paid' | 'failed'
  /** True when a concrete on-chain tx hash was observed for this attempt */
  settlementObserved?: boolean
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

/** Paid neighbourhood + OpenEHR + HES scale + SNOMED RF2 routes (x402 $0.01). */
const NEIGHBOURHOOD_PAID_ENDPOINTS = new Set([
  '/api/openehr/query/aql',
  '/api/neighbourhood/insights/lsoa',
  '/api/neighbourhood/insights/summary',
  '/api/neighbourhood/scale/search',
  '/api/neighbourhood/uk/search',
  '/api/neighbourhood/uk/synthesis',
  '/api/neighbourhood/scale/cross-summary',
  '/api/snomed/rf2/search',
  '/api/snomed/rf2/concept',
  '/api/snomed/rf2/summary',
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

/** SNOMED intelligence page: paid local RF2 search + concept (POST). */
const SNOMED_RF2_PAID_ENDPOINTS = new Set([
  '/api/snomed/rf2/search',
  '/api/snomed/rf2/concept',
  '/api/snomed/rf2/summary',
])

const DMD_ENDPOINTS = new Set(['/api/dmd/lookup', '/api/dmd/summary'])
const CDR_ENDPOINTS = new Set([
  '/api/cdr/vaults/allocate',
  '/api/cdr/vaults/:vaultId/encrypt-store',
  '/api/cdr/vaults/:vaultId/request-access',
  '/api/cdr/vaults/:vaultId/recover',
  '/api/cdr/vaults/:vaultId/revoke',
])

function normalizeCdrEndpoint(endpoint: string): string {
  if (/^\/api\/cdr\/vaults\/[^/]+\/encrypt-store$/.test(endpoint)) return '/api/cdr/vaults/:vaultId/encrypt-store'
  if (/^\/api\/cdr\/vaults\/[^/]+\/request-access$/.test(endpoint)) return '/api/cdr/vaults/:vaultId/request-access'
  if (/^\/api\/cdr\/vaults\/[^/]+\/recover$/.test(endpoint)) return '/api/cdr/vaults/:vaultId/recover'
  if (/^\/api\/cdr\/vaults\/[^/]+\/revoke$/.test(endpoint)) return '/api/cdr/vaults/:vaultId/revoke'
  return endpoint
}

/** Server gate price for those routes (`server/neighbourhood/router.js`, `server/openehr/bffRouter.js`). */
export const NEIGHBOURHOOD_X402_PRICE_DISPLAY = '$0.01'

export function paidDisplayForNeighbourhoodEndpoint(endpoint: string): string | undefined {
  if (NEIGHBOURHOOD_PAID_ENDPOINTS.has(endpoint)) return NEIGHBOURHOOD_X402_PRICE_DISPLAY
  if (DMD_ENDPOINTS.has(endpoint)) return NEIGHBOURHOOD_X402_PRICE_DISPLAY
  if (CDR_ENDPOINTS.has(normalizeCdrEndpoint(endpoint))) return NEIGHBOURHOOD_X402_PRICE_DISPLAY
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

/** Paid local RF2 search + concept POSTs — use on SNOMED intelligence transaction log. */
export function listNhsTxHistorySnomedRf2Search(network: NhsNetwork): NhsTxItem[] {
  return listNhsTxHistory().filter(
    (row) => row.network === network && SNOMED_RF2_PAID_ENDPOINTS.has(row.endpoint),
  )
}

export function listNhsTxHistoryDmd(network: NhsNetwork): NhsTxItem[] {
  return listNhsTxHistory().filter((row) => row.network === network && DMD_ENDPOINTS.has(row.endpoint))
}

export function listNhsTxHistoryCdr(network: NhsNetwork): NhsTxItem[] {
  return listNhsTxHistory().filter((row) => {
    if (row.network !== network) return false
    return CDR_ENDPOINTS.has(normalizeCdrEndpoint(row.endpoint))
  })
}

export function listNhsTxHistoryRunner(network: NhsNetwork): NhsTxItem[] {
  return listNhsTxHistory().filter((row) => row.network === network && typeof row.runnerMode === 'string')
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
