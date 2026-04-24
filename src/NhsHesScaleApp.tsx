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
  type WalletMode,
} from './nhsTxHistory'
import {
  getX402FacilitatorPreference,
  setX402FacilitatorPreference,
  type X402FacilitatorId,
} from './x402FacilitatorPreference'
import type { NhsNetwork, NhsRole } from './nhsSession'

type HealthJson = {
  ok?: boolean
  sqlite?: { aeRows?: number; opRows?: number; apcRows?: number; ftsRows?: number }
  dbFile?: { path?: string; bytes?: number }
  ingestMeta?: Array<{ key: string; value: string }>
  note?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatRowCount(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-GB')
}

function totalCareRows(s: HealthJson['sqlite']): number {
  const ae = s?.aeRows ?? 0
  const op = s?.opRows ?? 0
  const apc = s?.apcRows ?? 0
  return ae + op + apc
}

function formatTxTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
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
type TxModeFilter = 'all' | WalletMode

function HesScaleGrid({
  session,
  payLabel,
  health,
  healthLoading,
  healthError,
  dbFile,
  sqliteStats,
  x402Provider,
  onX402ProviderChange,
}: {
  session: NhsSession
  payLabel: string
  health: string
  healthLoading: boolean
  healthError: string | null
  dbFile: HealthJson['dbFile'] | null
  sqliteStats: HealthJson['sqlite'] | null
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
  const [activeAction, setActiveAction] = useState<'' | 'free-search' | 'paid-search' | 'cross-summary'>('')
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [txRows, setTxRows] = useState<NhsTxItem[]>(() => listNhsTxHistoryHesScale(session.network))
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')
  const [txPage, setTxPage] = useState(1)

  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistoryHesScale(session.network))
    setTxPage(1)
  }, [session.network])

  useEffect(() => {
    refreshTxLog()
  }, [refreshTxLog])

  useEffect(() => {
    if (!busy || requestStartedAt == null) return
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - requestStartedAt) / 1000)))
    }, 250)
    return () => clearInterval(id)
  }, [busy, requestStartedAt])

  const filteredTxRows = txRows.filter((row) => {
    if (txModeFilter === 'all') return true
    return row.walletMode === txModeFilter
  })
  const txTotalPages = filteredTxRows.length === 0 ? 0 : Math.ceil(filteredTxRows.length / TX_LOG_PAGE_SIZE)
  const txPageSafe = txTotalPages === 0 ? 1 : Math.min(txPage, txTotalPages)
  const txPageStart = (txPageSafe - 1) * TX_LOG_PAGE_SIZE
  const txPageRows = filteredTxRows.slice(txPageStart, txPageStart + TX_LOG_PAGE_SIZE)

  const formatSearchResultJson = (data: {
    searchMode?: string
    rows?: SearchRow[]
    tableCounts?: HealthJson['sqlite']
    emptyHint?: string | null
    free?: boolean
  }) => {
    const rows = data?.rows ?? []
    return JSON.stringify(
      {
        free: data?.free === true,
        searchMode: data?.searchMode,
        count: rows.length,
        tableCounts: data?.tableCounts,
        emptyHint: data?.emptyHint,
        rows: rows.slice(0, 25),
      },
      null,
      2,
    )
  }

  const runFreeSearch = async () => {
    setBusy(true)
    setActiveAction('free-search')
    setRequestStartedAt(Date.now())
    setElapsedSec(0)
    setSearchOut('')
    try {
      const u = new URL('/api/neighbourhood/scale/search', window.location.origin)
      u.searchParams.set('q', searchQ)
      u.searchParams.set('dataset', dataset)
      u.searchParams.set('limit', '25')
      u.searchParams.set('offset', '0')
      u.searchParams.set('mode', searchMode)
      const res = await fetch(u.toString())
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        rows?: SearchRow[]
        searchMode?: string
        tableCounts?: HealthJson['sqlite']
        emptyHint?: string | null
        free?: boolean
      }
      if (!res.ok || json.ok === false) {
        if (res.status === 404) {
          setSearchOut(
            'HTTP 404 — GET /api/neighbourhood/scale/search is missing on this API process. Restart npm run server (or dev:full) so the latest neighbourhood router is loaded.',
          )
          return
        }
        setSearchOut(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
        return
      }
      setSearchOut(formatSearchResultJson({ ...json, free: true }))
    } catch (e) {
      setSearchOut(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setActiveAction('')
      setRequestStartedAt(null)
      setElapsedSec(0)
    }
  }

  const runSearch = async () => {
    if (!session.wallet) {
      setSearchOut('Connect a wallet for paid search.')
      return
    }
    setBusy(true)
    setActiveAction('paid-search')
    setRequestStartedAt(Date.now())
    setElapsedSec(0)
    setSearchOut('')
    try {
      const res = await apiPost<{
        ok?: boolean
        rows?: SearchRow[]
        searchMode?: string
        tableCounts?: HealthJson['sqlite']
        emptyHint?: string | null
        disclaimer?: string
        free?: boolean
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
      setSearchOut(formatSearchResultJson({ ...(res.data ?? {}), free: false }))
    } finally {
      setBusy(false)
      setActiveAction('')
      setRequestStartedAt(null)
      setElapsedSec(0)
    }
  }

  const runCrossSummary = async () => {
    if (!session.wallet) {
      setSummaryOut('Connect a wallet for paid summary.')
      return
    }
    setBusy(true)
    setActiveAction('cross-summary')
    setRequestStartedAt(Date.now())
    setElapsedSec(0)
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
      setActiveAction('')
      setRequestStartedAt(null)
      setElapsedSec(0)
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
        {healthError ? (
          <p className="note" role="alert" style={{ color: '#b42318' }}>
            Could not load stats: {healthError}
          </p>
        ) : null}
        {sqliteStats ? (
          <>
            <p style={{ fontSize: '1.15rem', margin: '0.75rem 0 0.5rem', lineHeight: 1.35 }}>
              <strong>{formatRowCount(totalCareRows(sqliteStats))}</strong> synthetic HES rows in SQLite across{' '}
              <strong>AE + OP + APC</strong>
              {sqliteStats.ftsRows != null ? (
                <>
                  {' '}
                  · <strong>{formatRowCount(sqliteStats.ftsRows)}</strong> FTS-indexed documents (LSOA + pseudo id)
                </>
              ) : null}
              .
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(10.5rem, 1fr))',
                gap: '0.6rem',
                marginBottom: '0.75rem',
              }}
            >
              {(
                [
                  ['AE', sqliteStats.aeRows, 'Accident & emergency'],
                  ['OP', sqliteStats.opRows, 'Outpatient'],
                  ['APC', sqliteStats.apcRows, 'Admitted patient care'],
                ] as const
              ).map(([abbr, n, title]) => (
                <div
                  key={abbr}
                  title={title}
                  style={{
                    border: '1px solid rgba(15, 23, 42, 0.12)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.75rem',
                    background: 'rgba(255, 255, 255, 0.65)',
                  }}
                >
                  <div className="note" style={{ margin: 0, fontSize: '0.75rem', opacity: 0.85 }}>
                    {abbr}
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatRowCount(n)}
                  </div>
                  <div className="note" style={{ margin: '0.15rem 0 0', fontSize: '0.7rem' }}>
                    rows
                  </div>
                </div>
              ))}
            </div>
            {dbFile?.bytes != null ? (
              <p className="note" style={{ marginBottom: '0.75rem' }}>
                On-disk database: <strong>{formatBytes(dbFile.bytes)}</strong>
                {dbFile.path ? (
                  <>
                    {' '}
                    (<code style={{ fontSize: '0.8rem' }}>{dbFile.path}</code>)
                  </>
                ) : null}
              </p>
            ) : null}
            <p className="note" style={{ marginBottom: '0.75rem', fontSize: '0.82rem' }}>
              Row totals use fast sequence estimates suitable for large files (same numbers as the API). For empty tables,
              run ingest with the env vars above.
            </p>
          </>
        ) : healthLoading ? (
          <p className="note" style={{ marginBottom: '0.75rem' }}>
            Loading dataset statistics…
          </p>
        ) : !healthError ? (
          <p className="note" style={{ marginBottom: '0.75rem' }}>
            No row counts returned yet. Start the API and refresh, or run ingest.
          </p>
        ) : null}
        <details className="note">
          <summary style={{ cursor: 'pointer', marginBottom: '0.35rem' }}>Raw health JSON</summary>
          <pre className="note" style={{ overflow: 'auto', maxHeight: '14rem', margin: 0 }}>
            {health || '—'}
          </pre>
        </details>
      </article>

      <article className="card">
        <h2>FTS / prefix search (free + paid)</h2>
        {sqliteStats ? (
          <p className="note" style={{ marginBottom: '0.5rem' }}>
            <strong>SQLite rows:</strong> AE {sqliteStats.aeRows ?? 0} · OP {sqliteStats.opRows ?? 0} · APC{' '}
            {sqliteStats.apcRows ?? 0}
            {sqliteStats.ftsRows != null ? ` · FTS ${sqliteStats.ftsRows}` : null}.{' '}
            {(sqliteStats.opRows === 0 || sqliteStats.apcRows === 0) && (
              <>
                If <strong>OP</strong> or <strong>APC</strong> is 0, ingest those CSVs (
                <code>HES_OP_DIR</code>, <code>HES_APC_DIR</code>) — &quot;OP only&quot; / &quot;APC only&quot; search
                returns nothing until then.
              </>
            )}
          </p>
        ) : null}
        <p className="note">
          SQLite <strong>FTS5</strong> on LSOA + pseudo HES id; <strong>auto</strong> falls back to prefix match if FTS
          returns no rows. <strong>Search (free)</strong> uses <code>GET /api/neighbourhood/scale/search</code> (same
          query logic, no wallet). <strong>Search ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})</strong> uses the paid POST for
          x402 demos and the transaction log.
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className="secondary" disabled={busy} onClick={() => void runFreeSearch()}>
            Search (free)
          </button>
          <button type="button" disabled={busy || !session.wallet} onClick={() => void runSearch()}>
            Search ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
        </div>
        {!session.wallet ? (
          <p className="note" style={{ marginTop: '0.5rem' }}>
            Connect a wallet for paid search; free search does not require a wallet.
          </p>
        ) : null}
        {busy && (activeAction === 'free-search' || activeAction === 'paid-search') ? (
          <p className="note" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            {activeAction === 'free-search' ? 'Running free search' : 'Running paid search'}… {elapsedSec}s elapsed
          </p>
        ) : null}
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
        {busy && activeAction === 'cross-summary' ? (
          <p className="note" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            Running cross-dataset summary… {elapsedSec}s elapsed
          </p>
        ) : null}
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
        <div className="actions" role="group" aria-label="Filter by wallet mode">
          <button
            type="button"
            className={txModeFilter === 'all' ? 'primary' : 'secondary'}
            onClick={() => {
              setTxModeFilter('all')
              setTxPage(1)
            }}
          >
            All modes
          </button>
          <button
            type="button"
            className={txModeFilter === 'metamask' ? 'primary' : 'secondary'}
            onClick={() => {
              setTxModeFilter('metamask')
              setTxPage(1)
            }}
          >
            MetaMask
          </button>
          <button
            type="button"
            className={txModeFilter === 'circle' ? 'primary' : 'secondary'}
            onClick={() => {
              setTxModeFilter('circle')
              setTxPage(1)
            }}
          >
            Circle
          </button>
        </div>
        {filteredTxRows.length > 0 ? (
          <p className="note">
            Page <strong>{txPageSafe}</strong> of <strong>{txTotalPages}</strong> · {filteredTxRows.length} shown ·{' '}
            {txRows.length} total
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
        {filteredTxRows.length === 0 ? (
          <p className="note">No scale transactions for this mode filter yet.</p>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Mode</th>
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
                      <td>{formatTxTime(row.createdAt)}</td>
                      <td>
                        {row.walletMode === 'circle' ? (
                          <span className="tx-badge tx-badge--chain">Circle</span>
                        ) : row.walletMode === 'metamask' ? (
                          <span className="tx-badge tx-badge--audit">MetaMask</span>
                        ) : (
                          <span className="tx-muted">—</span>
                        )}
                      </td>
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
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [dbFile, setDbFile] = useState<HealthJson['dbFile'] | null>(null)
  const [sqliteStats, setSqliteStats] = useState<HealthJson['sqlite'] | null>(null)
  const [x402Provider, setX402Provider] = useState<X402FacilitatorId>(() => getX402FacilitatorPreference())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setHealthError(null)
      setHealthLoading(true)
      try {
        const res = await fetch('/api/neighbourhood/insights/health')
        const text = await res.text()
        if (!res.ok) {
          throw new Error(text ? `${res.status}: ${text.slice(0, 200)}` : `HTTP ${res.status}`)
        }
        let j: HealthJson
        try {
          j = JSON.parse(text) as HealthJson
        } catch {
          throw new Error('Response was not JSON (is the API running on port 8787?)')
        }
        if (cancelled) return
        setSqliteStats(j.sqlite ?? null)
        setDbFile(j.dbFile ?? null)
        const pretty = {
          ...j,
          dbFile: j.dbFile
            ? { ...j.dbFile, bytesHuman: j.dbFile.bytes != null ? formatBytes(j.dbFile.bytes) : undefined }
            : undefined,
        }
        setHealth(JSON.stringify(pretty, null, 2))
      } catch (e) {
        if (!cancelled) {
          setHealthError(e instanceof Error ? e.message : String(e))
          setSqliteStats(null)
          setDbFile(null)
          setHealth('')
        }
      } finally {
        if (!cancelled) setHealthLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
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
          healthLoading={healthLoading}
          healthError={healthError}
          dbFile={dbFile}
          sqliteStats={sqliteStats}
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
