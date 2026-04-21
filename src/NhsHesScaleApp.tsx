import { useCallback, useEffect, useState } from 'react'
import NhsShell from './NhsShell'
import { apiPost } from './nhsApi'
import {
  explorerAddressUrl,
  explorerUrl,
  listNhsTxHistoryHesScale,
  NEIGHBOURHOOD_X402_PRICE_DISPLAY,
  paidDisplayForNeighbourhoodEndpoint,
  type NhsTxItem,
} from './nhsTxHistory'
import {
  getX402FacilitatorPreference,
  setX402FacilitatorPreference,
  type X402FacilitatorId,
} from './x402FacilitatorPreference'
import type { NhsNetwork, NhsRole } from './nhsSession'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

type HealthJson = {
  ok?: boolean
  sqlite?: { aeRows?: number; opRows?: number; apcRows?: number; ftsRows?: number }
  dbFile?: { path?: string; bytes?: number }
  ingestMeta?: Array<{ key: string; value: string }>
  note?: string
}

type SearchRow = {
  rowid?: number
  lsoa?: string
  pseudo_hes_id?: string
  dataset?: string
  src_rowid?: number
  id?: number
}

type NhsSession = { role: NhsRole; wallet: string; network: NhsNetwork }

const TX_LOG_PAGE_SIZE = 10

function HesScaleGrid({
  session,
  payLabel,
  health,
  x402Provider,
  onX402ProviderChange,
}: {
  session: NhsSession
  payLabel: string
  health: string
  x402Provider: X402FacilitatorId
  onX402ProviderChange: (v: X402FacilitatorId) => void
}) {
  const [searchQ, setSearchQ] = useState('E010')
  const [dataset, setDataset] = useState<'all' | 'ae' | 'op' | 'apc'>('all')
  const [searchMode, setSearchMode] = useState<'auto' | 'fts' | 'prefix'>('auto')
  const [searchOut, setSearchOut] = useState<string>('')
  const [summaryOut, setSummaryOut] = useState<string>('')
  const [lsoaFilter, setLsoaFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [txRows, setTxRows] = useState<NhsTxItem[]>(() => listNhsTxHistoryHesScale(session.network))
  const [txPage, setTxPage] = useState(1)

  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistoryHesScale(session.network))
    setTxPage(1)
  }, [session.network])

  useEffect(() => {
    refreshTxLog()
  }, [refreshTxLog])

  const txTotalPages = txRows.length === 0 ? 0 : Math.ceil(txRows.length / TX_LOG_PAGE_SIZE)
  const txPageSafe = txTotalPages === 0 ? 1 : Math.min(txPage, txTotalPages)
  const txPageStart = (txPageSafe - 1) * TX_LOG_PAGE_SIZE
  const txPageRows = txRows.slice(txPageStart, txPageStart + TX_LOG_PAGE_SIZE)

  const runSearch = async () => {
    if (!session.wallet) {
      setSearchOut('Connect a wallet for paid search.')
      return
    }
    setBusy(true)
    setSearchOut('')
    try {
      const res = await apiPost<{
        ok?: boolean
        rows?: SearchRow[]
        searchMode?: string
        disclaimer?: string
      }>(
        '/api/neighbourhood/scale/search',
        session.role,
        session.wallet,
        { q: searchQ, dataset, limit: 25, offset: 0, mode: searchMode },
        { network: session.network },
      )
      if (!res.ok) {
        setSearchOut(res.error)
        return
      }
      refreshTxLog()
      const rows = res.data?.rows ?? []
      setSearchOut(
        JSON.stringify(
          { searchMode: res.data?.searchMode, count: rows.length, rows: rows.slice(0, 25) },
          null,
          2,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const runCrossSummary = async () => {
    if (!session.wallet) {
      setSummaryOut('Connect a wallet for paid summary.')
      return
    }
    setBusy(true)
    setSummaryOut('')
    try {
      const res = await apiPost<{ ok?: boolean; summary?: string; model?: string }>(
        '/api/neighbourhood/scale/cross-summary',
        session.role,
        session.wallet,
        { lsoa: lsoaFilter.trim() || undefined },
        { network: session.network },
      )
      if (!res.ok) {
        setSummaryOut(res.error)
        return
      }
      refreshTxLog()
      const s = res.data?.summary
      setSummaryOut(typeof s === 'string' ? s : JSON.stringify(res.data, null, 2))
    } finally {
      setBusy(false)
    }
  }

  const walletExplorer =
    session.wallet && session.wallet.startsWith('0x')
      ? explorerAddressUrl(session.network, session.wallet)
      : null

  return (
    <section className="grid">
      <article className="card">
        <h2>x402 settlement</h2>
        <p className="note">
          Full artificial HES (AE + OP + APC) in SQLite with <strong>FTS5</strong> search. Paid{' '}
          <strong>USDC {NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong> per search / cross-summary (same as neighbourhood
          insights). NHS <code>/api/nhs/*</code> stays Circle-only.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="x402-fac-scale" className="note">
            Provider
          </label>
          <select
            id="x402-fac-scale"
            value={x402Provider}
            onChange={(e) => onX402ProviderChange(e.target.value as X402FacilitatorId)}
          >
            <option value="circle">Circle Gateway (batch + deposit)</option>
            <option value="thirdweb">Thirdweb (EIP-3009 exact)</option>
          </select>
        </div>
        <p className="note" style={{ marginTop: '0.75rem' }}>
          Stack: <strong>{payLabel}</strong> · streaming CSV ingest · indexed LSOA · FTS token search with prefix
          fallback — built for long-run population analytics and per-API monetization.
        </p>
      </article>

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Dataset footprint (free)</h2>
        <p className="note">
          From <code>GET /api/neighbourhood/insights/health</code>. Ingest full CSV trees with{' '}
          <code>npm run ingest:hes</code> (set <code>HES_AE_DIR</code>, <code>HES_OP_DIR</code>, <code>HES_APC_DIR</code>
          , optional <code>HES_ROW_LIMIT_PER_FILE</code>).
        </p>
        <pre className="note" style={{ overflow: 'auto', maxHeight: '14rem' }}>
          {health || '…'}
        </pre>
      </article>

      <article className="card">
        <h2>FTS / prefix search (paid)</h2>
        <p className="note">
          SQLite <strong>FTS5</strong> on LSOA + pseudo HES id; <strong>auto</strong> falls back to prefix match if FTS
          returns no rows.
        </p>
        <label className="note" style={{ display: 'block', marginBottom: '0.35rem' }}>
          Query
        </label>
        <input
          className="note"
          style={{ width: '100%', marginBottom: '0.5rem' }}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="e.g. E01010560 or pseudo id fragment"
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <select value={dataset} onChange={(e) => setDataset(e.target.value as typeof dataset)}>
            <option value="all">all datasets</option>
            <option value="ae">AE only</option>
            <option value="op">OP only</option>
            <option value="apc">APC only</option>
          </select>
          <select value={searchMode} onChange={(e) => setSearchMode(e.target.value as typeof searchMode)}>
            <option value="auto">auto (FTS → prefix)</option>
            <option value="fts">FTS only</option>
            <option value="prefix">prefix only</option>
          </select>
        </div>
        <button type="button" disabled={busy || !session.wallet} onClick={() => void runSearch()}>
          Search ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
        </button>
        {!session.wallet ? <p className="note">Connect wallet to run paid search.</p> : null}
        {searchOut ? (
          <pre className="note" style={{ marginTop: '0.75rem', overflow: 'auto', maxHeight: '16rem' }}>
            {searchOut}
          </pre>
        ) : null}
      </article>

      <article className="card">
        <h2>Featherless: AE + OP + APC narrative (paid)</h2>
        <p className="note">
          Aggregates only (no row dumps). Optional LSOA filter narrows all three datasets.
        </p>
        <input
          className="note"
          style={{ width: '100%', marginBottom: '0.5rem' }}
          value={lsoaFilter}
          onChange={(e) => setLsoaFilter(e.target.value)}
          placeholder="Optional LSOA filter (exact)"
        />
        <button type="button" disabled={busy || !session.wallet} onClick={() => void runCrossSummary()}>
          Cross-dataset summary ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
        </button>
        {summaryOut ? (
          <div className="note" style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
            {summaryOut}
          </div>
        ) : null}
      </article>

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Why this scales</h2>
        <ul className="note" style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li>
            <strong>Streaming ingest</strong> — never loads multi-million-row CSVs into memory; batched SQLite
            transactions.
          </li>
          <li>
            <strong>Indexed queries</strong> — LSOA indexes + FTS5 for interactive exploration on laptop-grade disks.
          </li>
          <li>
            <strong>Per-request x402</strong> — USDC nanopayments align unit economics with API value (demo on Arc
            testnet).
          </li>
          <li>
            <strong>Featherless</strong> — LLM narrative on capped aggregate JSON, not raw PHI-style rows.
          </li>
        </ul>
      </article>

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Transaction log (this page)</h2>
        <p className="note tx-note-tight">
          Paid calls to <code>/api/neighbourhood/scale/*</code> · {NEIGHBOURHOOD_X402_PRICE_DISPLAY} list price.
        </p>
        <button type="button" className="secondary" onClick={() => refreshTxLog()}>
          Refresh log
        </button>
        {txRows.length > 0 ? (
          <p className="note">
            Page <strong>{txPageSafe}</strong> of <strong>{txTotalPages}</strong> · {txRows.length} total
          </p>
        ) : null}
        <div className="actions" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="secondary"
            disabled={txPageSafe <= 1}
            onClick={() => setTxPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="secondary"
            disabled={txPageSafe >= txTotalPages}
            onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
          >
            Next
          </button>
        </div>
        {txRows.length === 0 ? (
          <p className="note">No scale transactions yet.</p>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Paid</th>
                  <th>Ref / tx</th>
                  <th>Explorer</th>
                </tr>
              </thead>
              <tbody>
                {txPageRows.map((row) => {
                  const kind = row.kind ?? (row.txHash.startsWith('0x') ? 'chain' : 'audit')
                  const txLink = explorerUrl(row.network, row.txHash)
                  const paid = paidDisplayForNeighbourhoodEndpoint(row.endpoint)
                  const refLabel =
                    kind === 'audit' && row.auditRef
                      ? row.auditRef
                      : row.txHash.length > 22
                        ? `${row.txHash.slice(0, 10)}…${row.txHash.slice(-8)}`
                        : row.txHash
                  return (
                    <tr key={`${row.txHash}-${row.createdAt}-${row.endpoint}`}>
                      <td>
                        <code>{row.endpoint}</code>
                      </td>
                      <td>{paid ?? '—'}</td>
                      <td>
                        <code title={row.txHash}>{refLabel}</code>
                      </td>
                      <td className="tx-explorer-cell">
                        {txLink ? (
                          <a href={txLink} target="_blank" rel="noreferrer">
                            View tx
                          </a>
                        ) : walletExplorer ? (
                          <a href={walletExplorer} target="_blank" rel="noreferrer">
                            Wallet
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}

export default function NhsHesScaleApp() {
  const [health, setHealth] = useState<string>('')
  const [x402Provider, setX402Provider] = useState<X402FacilitatorId>(() => getX402FacilitatorPreference())

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/neighbourhood/insights/health')
      const j = (await res.json()) as HealthJson
      const pretty = {
        ...j,
        dbFile: j.dbFile
          ? { ...j.dbFile, bytesHuman: j.dbFile.bytes != null ? formatBytes(j.dbFile.bytes) : undefined }
          : undefined,
      }
      setHealth(JSON.stringify(pretty, null, 2))
    })()
  }, [])

  const payLabel = x402Provider === 'thirdweb' ? 'thirdweb x402' : 'Circle Gateway x402'

  return (
    <NhsShell
      title="HES at scale"
      subtitle="Full artificial HES AE / OP / APC in SQLite, FTS5 search, x402 USDC per API, Featherless on aggregates — demo only."
    >
      {(session) => (
        <HesScaleGrid
          session={session}
          payLabel={payLabel}
          health={health}
          x402Provider={x402Provider}
          onX402ProviderChange={(v) => {
            setX402FacilitatorPreference(v)
            setX402Provider(v)
          }}
        />
      )}
    </NhsShell>
  )
}
