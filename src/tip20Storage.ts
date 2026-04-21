import type { NhsNetwork } from './nhsSession'

const STORAGE_KEY = 'nhs_tip20_launches_v2'
const MAX_ROWS = 50

export type Tip20StoredLaunch = {
  launchId: string
  network: NhsNetwork
  name: string
  symbol: string
  currency: string
  ownerAddress: string
  tokenAddress: string
  tokenId: string
  txHash: string
  createdAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStoredLaunch(value: unknown): value is Tip20StoredLaunch {
  if (!isRecord(value)) return false
  return (
    typeof value.launchId === 'string' &&
    (value.network === 'testnet' || value.network === 'mainnet') &&
    typeof value.name === 'string' &&
    typeof value.symbol === 'string' &&
    typeof value.currency === 'string' &&
    typeof value.ownerAddress === 'string' &&
    typeof value.tokenAddress === 'string' &&
    typeof value.tokenId === 'string' &&
    typeof value.txHash === 'string' &&
    typeof value.createdAt === 'string'
  )
}

export function readTip20Launches(): Tip20StoredLaunch[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredLaunch)
  } catch {
    return []
  }
}

export function appendTip20Launch(row: Tip20StoredLaunch): void {
  if (typeof localStorage === 'undefined') return
  const next = [row, ...readTip20Launches()].slice(0, MAX_ROWS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}
