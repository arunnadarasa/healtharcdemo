import { useCallback, useEffect, useState } from 'react'
import NhsShell from './NhsShell'
import { apiPost } from './nhsApi'
import {
  explorerAddressUrl,
  explorerUrl,
  listNhsTxHistoryHesScale,
  NEIGHBOURHOOD_X402_PRICE_DISPLAY,
  type NhsTxItem,
  type WalletMode,
} from './nhsTxHistory'
import {
  getX402FacilitatorPreference,
  setX402FacilitatorPreference,
  type X402FacilitatorId,
} from './x402FacilitatorPreference'
import type { NhsNetwork, NhsRole } from './nhsSession'

type NhsSession = { role: NhsRole; wallet: string; network: NhsNetwork }
type TxModeFilter = 'all' | WalletMode

type SearchRow = {
  dataset: string
  pseudo_id: string
  lsoa11: string | null
  score?: number
}

type IntegrationContext = {
  hackathon?: {
    snomedCt?: {
      browser?: string
      ihtsdoGithub?: string
      snowstorm?: {
        status?: {
          configured?: boolean
          reachable?: boolean
          url?: string
          error?: string
        }
      }
    }
  }
}

const TX_LOG_PAGE_SIZE = 10

function SnomedIntelligenceGrid({
  session,
  payLabel,
  x402Provider,
  onX402ProviderChange,
}: {
  session: NhsSession
  payLabel: string
  x402Provider: X402FacilitatorId
  onX402ProviderChange: (v: X402FacilitatorId) => void
}) {
  const [integration, setIntegration] = useState<IntegrationContext | null>(null)
  const [busy, setBusy] = useState(false)
  const [activeAction, setActiveAction] = useState<'' | 'search' | 'summary'>('')
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [txRows, setTxRows] = useState<NhsTxItem[]>(() => listNhsTxHistoryHesScale(session.network))
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')
  const [txPage, setTxPage] = useState(1)

  const [conceptId, setConceptId] = useState('50849002')
  const [snomedOut, setSnomedOut] = useState('')

  const [searchQ, setSearchQ] = useState('asthma')
  const [dataset, setDataset] = useState<'all' | 'ae' | 'op' | 'apc'>('all')
  const [searchOut, setSearchOut] = useState('')
  const [summaryOut, setSummaryOut] = useState('')
  const [lsoaFilter, setLsoaFilter] = useState('')

  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistoryHesScale(session.network))
    setTxPage(1)
  }, [session.network])

  useEffect(() => {
    void (async () => {
      try {
        const signal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(5000)
            : undefined
        const res = await fetch('/api/neighbourhood/insights/context', signal ? { signal } : undefined)
        const text = await res.text()
        if (!res.ok) return
        const j = JSON.parse(text) as IntegrationContext
        setIntegration(j)
      } catch {
        /* keep page usable without context */
      }
    })()
  }, [])

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

  const runPaidSearch = async () => {
    if (!session.wallet) {
      setSearchOut('Connect a wallet for paid search.')
      return
    }
    setBusy(true)
    setActiveAction('search')
    setRequestStartedAt(Date.now())
    setElapsedSec(0)
    setSearchOut('')
    try {
      const res = await apiPost<{
        rows?: SearchRow[]
        searchMode?: string
        emptyHint?: string | null
      }>(
        '/api/neighbourhood/scale/search',
        session.role,
        session.wallet,
        { q: searchQ, dataset, limit: 25, offset: 0 },
        { network: session.network },
      )
      if (!res.ok) {
        setSearchOut(res.error)
        return
      }
      refreshTxLog()
      setSearchOut(
        JSON.stringify(
          {
            searchMode: res.data?.searchMode,
            count: res.data?.rows?.length ?? 0,
            emptyHint: res.data?.emptyHint,
            rows: res.data?.rows ?? [],
          },
          null,
          2,
        ),
      )
    } finally {
      setBusy(false)
      setActiveAction('')
      setRequestStartedAt(null)
      setElapsedSec(0)
    }
  }

  const runPaidSummary = async () => {
    if (!session.wallet) {
      setSummaryOut('Connect a wallet for paid summary.')
      return
    }
    setBusy(true)
    setActiveAction('summary')
    setRequestStartedAt(Date.now())
    setElapsedSec(0)
    setSummaryOut('')
    try {
      const res = await apiPost<{ summary?: string; model?: string }>(
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
      setSummaryOut(typeof res.data?.summary === 'string' ? res.data.summary : JSON.stringify(res.data, null, 2))
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
          SNOMED intelligence demo: paid terminology search + summary over indexed HES context with{' '}
          <strong>USDC {NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong> pricing.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="x402-fac-snomed" className="note">
            Provider
          </label>
          <select
            id="x402-fac-snomed"
            value={x402Provider}
            onChange={(e) => onX402ProviderChange(e.target.value as X402FacilitatorId)}
          >
            <option value="circle">Circle Gateway (batch + deposit)</option>
            <option value="thirdweb">Thirdweb (EIP-3009 exact)</option>
          </select>
        </div>
        <p className="note" style={{ marginTop: '0.75rem' }}>
          Active path: <strong>{payLabel}</strong>. Wallet mode (MetaMask/Circle) is controlled in the top bar.
        </p>
      </article>

      <article className="card">
        <h2>SNOMED CT + Snowstorm (free)</h2>
        <p className="note">
          Snowstorm is backed by Elasticsearch. Use this section to prove terminology infrastructure is alive before paid
          USDC calls.
        </p>
        {integration?.hackathon?.snomedCt?.browser ? (
          <p className="note">
            Browser:{' '}
            <a href={integration.hackathon.snomedCt.browser} target="_blank" rel="noreferrer">
              SNOMED International Browser
            </a>{' '}
            ·{' '}
            <a href="https://termbrowser.nhs.uk/" target="_blank" rel="noreferrer">
              NHS Digital SNOMED CT Browser
            </a>{' '}
            · Tooling:{' '}
            <a href={integration.hackathon.snomedCt.ihtsdoGithub} target="_blank" rel="noreferrer">
              IHTSDO on GitHub
            </a>
          </p>
        ) : null}
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const res = await fetch('/api/snomed/health')
              const j = await res.json()
              setSnomedOut(JSON.stringify(j, null, 2))
            }}
          >
            GET /api/snomed/health
          </button>
          <input value={conceptId} onChange={(e) => setConceptId(e.target.value)} placeholder="SNOMED concept id" />
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const id = conceptId.trim() || '50849002'
              const res = await fetch(`/api/snomed/lookup/${encodeURIComponent(id)}`)
              const j = await res.json()
              setSnomedOut(JSON.stringify(j, null, 2))
            }}
          >
            Lookup concept
          </button>
        </div>
        <pre className="log">{snomedOut || 'Run Snowstorm health/lookup to preview terminology context.'}</pre>
      </article>

      <article className="card">
        <h2>Paid: Indexed terminology search</h2>
        <p className="note">
          Paid search endpoint over indexed HES/LSOA data. Demonstrates monetized retrieval path alongside SNOMED context.
        </p>
        <label>
          Query
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="e.g. asthma" />
        </label>
        <label>
          Dataset
          <select value={dataset} onChange={(e) => setDataset(e.target.value as 'all' | 'ae' | 'op' | 'apc')}>
            <option value="all">All</option>
            <option value="ae">AE</option>
            <option value="op">OP</option>
            <option value="apc">APC</option>
          </select>
        </label>
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runPaidSearch()}>
            Run paid search ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'search' ? (
            <p className="note" style={{ margin: 0 }}>
              Running search… {elapsedSec}s elapsed
            </p>
          ) : null}
        </div>
        <pre className="log">{searchOut || 'No paid search result yet.'}</pre>
      </article>

      <article className="card">
        <h2>Paid: SNOMED-ready summary</h2>
        <p className="note">
          Paid summary for neighbourhood planning; prompt frames output with SNOMED/OpenEHR interoperability context.
        </p>
        <label>
          LSOA filter (optional)
          <input value={lsoaFilter} onChange={(e) => setLsoaFilter(e.target.value)} placeholder="e.g. E01022770" />
        </label>
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runPaidSummary()}>
            Run paid summary ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'summary' ? (
            <p className="note" style={{ margin: 0 }}>
              Running summary… {elapsedSec}s elapsed
            </p>
          ) : null}
        </div>
        <pre className="log">{summaryOut || 'No paid summary result yet.'}</pre>
      </article>

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Transaction log (this page)</h2>
        <div className="actions" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
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
        </div>
        {filteredTxRows.length === 0 ? (
          <p className="note">No paid calls recorded yet for these endpoints.</p>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Mode</th>
                  <th>Endpoint</th>
                  <th>Ref / tx</th>
                  <th>Explorer</th>
                </tr>
              </thead>
              <tbody>
                {txPageRows.map((row) => {
                  const txLink = explorerUrl(row.network, row.txHash)
                  const refLabel =
                    row.txHash.length > 22 ? `${row.txHash.slice(0, 10)}…${row.txHash.slice(-8)}` : row.txHash
                  return (
                    <tr key={`${row.txHash}-${row.createdAt}-${row.endpoint}`}>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
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
                      <td>
                        <code title={row.txHash}>{refLabel}</code>
                      </td>
                      <td className="tx-explorer-cell">
                        {txLink ? (
                          <a href={txLink} target="_blank" rel="noreferrer">
                            View transaction
                          </a>
                        ) : walletExplorer ? (
                          <a href={walletExplorer} target="_blank" rel="noreferrer">
                            Wallet on explorer
                          </a>
                        ) : (
                          <span className="tx-muted">—</span>
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

export default function NhsSnomedIntelligenceApp() {
  const [x402Provider, setX402Provider] = useState<X402FacilitatorId>(() => getX402FacilitatorPreference())
  const payLabel = x402Provider === 'thirdweb' ? 'thirdweb x402' : 'Circle Gateway x402'

  return (
    <NhsShell
      title="SNOMED intelligence"
      subtitle="Showcase SNOMED CT + Snowstorm (Elasticsearch-backed) with paid USDC x402 search and summary endpoints."
    >
      {(session) => (
        <SnomedIntelligenceGrid
          key={session.network}
          session={session}
          payLabel={payLabel}
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
