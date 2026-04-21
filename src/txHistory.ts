export type TxNetwork = 'testnet' | 'mainnet'

export type TxFlow = 'battle' | 'coaching' | 'beats' | 'email'

export type TxHistoryItem = {
  hash: string
  network: TxNetwork
  flow: TxFlow
  createdAt: string
}

const STORAGE_KEY = 'clinical_arc_tx_history_v1'

const safeParse = (raw: string | null): TxHistoryItem[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.hash === 'string' &&
        typeof item.network === 'string' &&
        typeof item.flow === 'string' &&
        typeof item.createdAt === 'string',
    ) as TxHistoryItem[]
  } catch {
    return []
  }
}

export const listTxHistory = (): TxHistoryItem[] => {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export const addTxHistory = (item: Omit<TxHistoryItem, 'createdAt'>) => {
  if (typeof window === 'undefined') return
  const raw = item.hash.trim()
  const tx = raw.startsWith('0x') ? raw : /^([a-fA-F0-9]{64})$/.test(raw) ? `0x${raw}` : raw
  if (!tx.startsWith('0x') || tx.length !== 66) return
  const current = listTxHistory()
  const exists = current.some((entry) => entry.hash.toLowerCase() === tx.toLowerCase() && entry.network === item.network)
  if (exists) return
  const next: TxHistoryItem[] = [{ ...item, hash: tx, createdAt: new Date().toISOString() }, ...current].slice(0, 150)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export const clearTxHistory = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export const explorerTxUrl = (_network: TxNetwork, hash: string) =>
  `https://testnet.arcscan.app/tx/${hash}`
