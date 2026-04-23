import { useCallback, useEffect, useState } from 'react'
import NhsShell from './NhsShell'
import { apiPost } from './nhsApi'
import {
  explorerAddressUrl,
  explorerUrl,
  listNhsTxHistoryDmd,
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
const TX_LOG_PAGE_SIZE = 10

function DmdIntelligenceGrid({
  session,
  x402Provider,
  onX402ProviderChange,
}: {
  session: NhsSession
  x402Provider: X402FacilitatorId
  onX402ProviderChange: (v: X402FacilitatorId) => void
}) {
  const [busy, setBusy] = useState(false)
  const [activeAction, setActiveAction] = useState<'' | 'lookup' | 'summary'>('')
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)

  const [query, setQuery] = useState('paracetamol')
  const [nhsCode, setNhsCode] = useState('')
  const [freeOut, setFreeOut] = useState('No free query result yet.')
  const [lookupOut, setLookupOut] = useState('No paid lookup result yet.')
  const [summaryOut, setSummaryOut] = useState('No paid summary result yet.')

  const [txRows, setTxRows] = useState<NhsTxItem[]>([])
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')
  const [txPage, setTxPage] = useState(1)

  const payLabel = x402Provider === 'thirdweb' ? 'thirdweb x402' : 'Circle Gateway x402'
  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistoryDmd(session.network))
    setTxPage(1)
  }, [session.network])

  useEffect(() => {
    if (!busy || requestStartedAt == null) return
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - requestStartedAt) / 1000)))
    }, 250)
    return () => clearInterval(id)
  }, [busy, requestStartedAt])

  useEffect(() => {
    refreshTxLog()
  }, [refreshTxLog])

  const filteredTxRows = txRows.filter((row) => {
    if (txModeFilter === 'all') return true
    return row.walletMode === txModeFilter
  })
  const txTotalPages = filteredTxRows.length === 0 ? 0 : Math.ceil(filteredTxRows.length / TX_LOG_PAGE_SIZE)
  const txPageSafe = txTotalPages === 0 ? 1 : Math.min(txPage, txTotalPages)
  const txPageStart = (txPageSafe - 1) * TX_LOG_PAGE_SIZE
  const txPageRows = filteredTxRows.slice(txPageStart, txPageStart + TX_LOG_PAGE_SIZE)
  const walletExplorer =
    session.wallet && session.wallet.startsWith('0x') ? explorerAddressUrl(session.network, session.wallet) : null

  const runPaidLookup = async () => {
    if (!session.wallet) {
      setLookupOut('Connect a wallet for paid dm+d lookup.')
      return
    }
    setBusy(true)
    setActiveAction('lookup')
    setRequestStartedAt(Date.now())
    setElapsedSec(0)
    setLookupOut('')
    try {
      const res = await apiPost<unknown>(
        '/api/dmd/lookup',
        session.role,
        session.wallet,
        { q: query.trim(), code: nhsCode.trim() || undefined },
        { network: session.network },
      )
      setLookupOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
      if (res.ok) refreshTxLog()
    } finally {
      setBusy(false)
      setActiveAction('')
      setRequestStartedAt(null)
      setElapsedSec(0)
    }
  }

  const runPaidSummary = async () => {
    if (!session.wallet) {
      setSummaryOut('Connect a wallet for paid dm+d summary.')
      return
    }
    setBusy(true)
    setActiveAction('summary')
    setRequestStartedAt(Date.now())
    setElapsedSec(0)
    setSummaryOut('')
    try {
      const res = await apiPost<unknown>(
        '/api/dmd/summary',
        session.role,
        session.wallet,
        { q: query.trim(), code: nhsCode.trim() || undefined },
        { network: session.network },
      )
      setSummaryOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
      if (res.ok) refreshTxLog()
    } finally {
      setBusy(false)
      setActiveAction('')
      setRequestStartedAt(null)
      setElapsedSec(0)
    }
  }

  const runFreeSearch = async () => {
    try {
      const url = new URL('/api/dmd/search', window.location.origin)
      if (query.trim()) url.searchParams.set('q', query.trim())
      if (nhsCode.trim()) url.searchParams.set('code', nhsCode.trim())
      const res = await fetch(url.toString())
      const payload = await res.json().catch(() => ({}))
      setFreeOut(JSON.stringify(payload, null, 2))
    } catch (e) {
      setFreeOut(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="grid">
      <article className="card">
        <h2>x402 settlement</h2>
        <p className="note">
          dm+d intelligence demo: monetize drug lookup and prescribing enrichments with{' '}
          <strong>USDC {NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong> per paid API call.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="x402-fac-dmd" className="note">
            Provider
          </label>
          <select
            id="x402-fac-dmd"
            value={x402Provider}
            onChange={(e) => {
              const v = e.target.value as X402FacilitatorId
              setX402FacilitatorPreference(v)
              onX402ProviderChange(v)
            }}
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
        <h2>NHSBSA dm+d (free)</h2>
        <p className="note">
          Local dataset source: <code>/Users/openclaw/Downloads/nhsbsa_dmd_4.2.0_20260420000001</code>. Use free
          search to verify API readiness before paid calls.
        </p>
        <label>
          Drug query
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. paracetamol" />
        </label>
        <label>
          Optional dm+d / SNOMED code
          <input value={nhsCode} onChange={(e) => setNhsCode(e.target.value)} placeholder="e.g. 777067000" />
        </label>
        <div className="actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => void runFreeSearch()}>
            GET /api/dmd/search
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const res = await fetch('/api/dmd/health')
              const payload = await res.json().catch(() => ({}))
              setFreeOut(JSON.stringify(payload, null, 2))
            }}
          >
            GET /api/dmd/health
          </button>
        </div>
        <pre className="log">{freeOut}</pre>
      </article>

      <article className="card">
        <h2>Paid: dm+d enriched lookup</h2>
        <p className="note">
          Paid endpoint for normalized product profile (VTM/VMP/AMP links, packs, and metadata) for commercial API
          scenarios.
        </p>
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runPaidLookup()}>
            Run paid lookup ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'lookup' ? (
            <p className="note" style={{ margin: 0 }}>
              Running lookup… {elapsedSec}s elapsed
            </p>
          ) : null}
        </div>
        <pre className="log">{lookupOut}</pre>
      </article>

      <article className="card">
        <h2>Paid: prescribing summary</h2>
        <p className="note">
          Paid summary endpoint to generate short prescribing intelligence narrative from dm+d result context.
        </p>
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
        <pre className="log">{summaryOut}</pre>
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
          {filteredTxRows.length > 0 ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={txPageSafe <= 1}
                onClick={() => setTxPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="secondary"
                disabled={txPageSafe >= txTotalPages}
                onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
              >
                Next
              </button>
            </>
          ) : null}
        </div>
        {filteredTxRows.length === 0 ? (
          <p className="note">No paid dm+d calls recorded yet.</p>
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

export default function NhsDmdIntelligenceApp() {
  const [x402Provider, setX402Provider] = useState<X402FacilitatorId>(() => getX402FacilitatorPreference())

  return (
    <NhsShell
      title="NHSBSA dm+d intelligence"
      subtitle="Showcase NHSBSA dm+d drug lookup + paid USDC x402 enrichment/summary flows for prescribing intelligence demos."
    >
      {(session) => (
        <DmdIntelligenceGrid
          key={session.network}
          session={session}
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
