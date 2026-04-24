import { useCallback, useEffect, useState } from 'react'
import NhsShell from './NhsShell'
import { apiPost } from './nhsApi'
import {
  explorerAddressUrl,
  explorerUrl,
  listNhsTxHistorySnomedRf2Search,
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

type Rf2SearchRow = {
  conceptId: string
  preferredTerm: string | null
  fsn: string | null
  active: boolean
  moduleId: string | null
  effectiveTime: string | null
  score?: number
  matchCount?: number
}

type Rf2ConceptDetails = {
  conceptId: string
  active: boolean
  moduleId: string | null
  effectiveTime: string | null
  definitionStatusId: string | null
  sourcePackage: string
  preferredTerm: string | null
  fsn: string | null
  descriptions: Array<{
    descriptionId: string
    term: string
    typeId: string
    languageCode: string
    active: number
    effectiveTime: string | null
    moduleId: string | null
  }>
  parents: Array<{ conceptId: string; preferredTerm: string | null; fsn: string | null }>
  children: Array<{ conceptId: string; preferredTerm: string | null; fsn: string | null }>
}

type PaidRf2SearchPayload = {
  ok?: boolean
  rows?: Rf2SearchRow[]
  receiptRef?: string | null
  error?: string
  buildStatus?: unknown
}

type PaidRf2ConceptPayload = Rf2ConceptDetails & {
  ok?: boolean
  receiptRef?: string | null
  error?: string
  buildStatus?: unknown
}

type PaidRf2FeatherlessPayload = {
  ok?: boolean
  summary?: string
  model?: string
  conceptId?: string
  disclaimer?: string
  receiptRef?: string | null
  error?: string
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
  const [txRows, setTxRows] = useState<NhsTxItem[]>(() => listNhsTxHistorySnomedRf2Search(session.network))
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')
  const [txPage, setTxPage] = useState(1)

  const [rf2HealthOut, setRf2HealthOut] = useState('')
  const [rf2Query, setRf2Query] = useState('pregnancy')
  const [rf2SearchOut, setRf2SearchOut] = useState<Rf2SearchRow[]>([])
  const [rf2Selected, setRf2Selected] = useState('289908002')
  const [rf2ConceptOut, setRf2ConceptOut] = useState<Rf2ConceptDetails | null>(null)
  const [rf2DetailTab, setRf2DetailTab] = useState<'summary' | 'descriptions' | 'hierarchy'>('summary')
  const [rf2FeatherlessOut, setRf2FeatherlessOut] = useState('')
  const [rf2Error, setRf2Error] = useState('')
  const [rf2Busy, setRf2Busy] = useState<
    'idle' | 'health' | 'search' | 'paidSearch' | 'paidConcept' | 'paidFeatherless' | 'concept'
  >('idle')
  const [rf2PaidStartedAt, setRf2PaidStartedAt] = useState<number | null>(null)
  const [rf2PaidElapsedSec, setRf2PaidElapsedSec] = useState(0)

  const runRf2Health = useCallback(async () => {
    setRf2Error('')
    setRf2Busy('health')
    try {
      const res = await fetch('/api/snomed/rf2/health')
      const j = await res.json()
      setRf2HealthOut(JSON.stringify(j, null, 2))
    } catch (e) {
      setRf2Error(String((e as Error)?.message || e))
    } finally {
      setRf2Busy('idle')
    }
  }, [])

  const runRf2Search = useCallback(async () => {
    const q = rf2Query.trim()
    if (!q) {
      setRf2Error('Enter a term or SCTID.')
      return
    }
    setRf2Error('')
    setRf2Busy('search')
    try {
      const res = await fetch(`/api/snomed/rf2/search?q=${encodeURIComponent(q)}&limit=30`)
      const j = await res.json()
      if (!res.ok) {
        const extra =
          res.status === 503 && j?.buildStatus
            ? ` (build: ${String(j.buildStatus.status)}${j.buildStatus.error ? ` — ${String(j.buildStatus.error)}` : ''})`
            : ''
        setRf2Error((j?.error || `HTTP ${res.status}`) + extra)
        return
      }
      const rows = Array.isArray(j?.rows) ? (j.rows as Rf2SearchRow[]) : []
      setRf2SearchOut(rows)
      if (rows[0]?.conceptId) {
        setRf2Selected(rows[0].conceptId)
      }
    } catch (e) {
      setRf2Error(String((e as Error)?.message || e))
    } finally {
      setRf2Busy('idle')
    }
  }, [rf2Query])

  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistorySnomedRf2Search(session.network))
    setTxPage(1)
  }, [session.network])

  const runPaidRf2Search = useCallback(async () => {
    const q = rf2Query.trim()
    if (!q) {
      setRf2Error('Enter a term or SCTID.')
      return
    }
    if (!session.wallet) {
      setRf2Error('Connect a wallet for paid RF2 search.')
      return
    }
    setRf2Error('')
    setRf2Busy('paidSearch')
    setRf2PaidStartedAt(Date.now())
    setRf2PaidElapsedSec(0)
    try {
      const res = await apiPost<PaidRf2SearchPayload>(
        '/api/snomed/rf2/search',
        session.role,
        session.wallet,
        { q, limit: 30, offset: 0 },
        { network: session.network },
      )
      if (!res.ok) {
        setRf2Error(res.error)
        return
      }
      refreshTxLog()
      const data = res.data
      const rows = Array.isArray(data?.rows) ? data.rows : []
      setRf2SearchOut(rows)
      if (rows[0]?.conceptId) {
        setRf2Selected(rows[0].conceptId)
      }
    } catch (e) {
      setRf2Error(String((e as Error)?.message || e))
    } finally {
      setRf2Busy('idle')
      setRf2PaidStartedAt(null)
      setRf2PaidElapsedSec(0)
    }
  }, [rf2Query, refreshTxLog, session.network, session.role, session.wallet])

  const runPaidRf2Concept = useCallback(
    async (idFromRow?: string) => {
      const id = (idFromRow || rf2Selected || '').trim()
      if (!id) {
        setRf2Error('Enter a SCTID to load.')
        return
      }
      if (!session.wallet) {
        setRf2Error('Connect a wallet for paid concept load.')
        return
      }
      setRf2Error('')
      setRf2FeatherlessOut('')
      setRf2Busy('paidConcept')
      setRf2PaidStartedAt(Date.now())
      setRf2PaidElapsedSec(0)
      try {
        const res = await apiPost<PaidRf2ConceptPayload>(
          '/api/snomed/rf2/concept',
          session.role,
          session.wallet,
          { conceptId: id },
          { network: session.network },
        )
        if (!res.ok) {
          setRf2ConceptOut(null)
          setRf2Error(res.error)
          return
        }
        refreshTxLog()
        const data = res.data
        const { ok: _ok, receiptRef: _ref, ...concept } = data as PaidRf2ConceptPayload
        setRf2ConceptOut(concept as Rf2ConceptDetails)
        setRf2DetailTab('summary')
        setRf2Selected(id)
      } catch (e) {
        setRf2ConceptOut(null)
        setRf2Error(String((e as Error)?.message || e))
      } finally {
        setRf2Busy('idle')
        setRf2PaidStartedAt(null)
        setRf2PaidElapsedSec(0)
      }
    },
    [refreshTxLog, rf2Selected, session.network, session.role, session.wallet],
  )

  const runPaidFeatherlessSummary = useCallback(async () => {
    const id = rf2Selected.trim()
    if (!/^\d+$/.test(id)) {
      setRf2Error('Enter a numeric SCTID for Featherless summary.')
      return
    }
    if (!session.wallet) {
      setRf2Error('Connect a wallet for Featherless summary.')
      return
    }
    setRf2Error('')
    setRf2Busy('paidFeatherless')
    setRf2PaidStartedAt(Date.now())
    setRf2PaidElapsedSec(0)
    try {
      const res = await apiPost<PaidRf2FeatherlessPayload>(
        '/api/snomed/rf2/summary',
        session.role,
        session.wallet,
        { conceptId: id },
        { network: session.network },
      )
      if (!res.ok) {
        setRf2Error(res.error)
        return
      }
      refreshTxLog()
      const summary = typeof res.data?.summary === 'string' ? res.data.summary : ''
      setRf2FeatherlessOut(summary || JSON.stringify(res.data, null, 2))
    } catch (e) {
      setRf2Error(String((e as Error)?.message || e))
    } finally {
      setRf2Busy('idle')
      setRf2PaidStartedAt(null)
      setRf2PaidElapsedSec(0)
    }
  }, [refreshTxLog, rf2Selected, session.network, session.role, session.wallet])

  const runRf2Lookup = useCallback(async (idFromRow?: string) => {
    const id = (idFromRow || rf2Selected || '').trim()
    if (!id) return
    setRf2Error('')
    setRf2FeatherlessOut('')
    setRf2Busy('concept')
    try {
      const res = await fetch(`/api/snomed/rf2/concept/${encodeURIComponent(id)}`)
      const j = await res.json()
      if (!res.ok) {
        setRf2ConceptOut(null)
        const extra =
          res.status === 503 && j?.buildStatus
            ? ` (build: ${String(j.buildStatus.status)}${j.buildStatus.error ? ` — ${String(j.buildStatus.error)}` : ''})`
            : ''
        setRf2Error((j?.error || `HTTP ${res.status}`) + extra)
        return
      }
      setRf2ConceptOut(j as Rf2ConceptDetails)
      setRf2DetailTab('summary')
      setRf2Selected(id)
    } catch (e) {
      setRf2ConceptOut(null)
      setRf2Error(String((e as Error)?.message || e))
    } finally {
      setRf2Busy('idle')
    }
  }, [rf2Selected])

  useEffect(() => {
    if (
      (rf2Busy !== 'paidSearch' && rf2Busy !== 'paidConcept' && rf2Busy !== 'paidFeatherless') ||
      rf2PaidStartedAt == null
    )
      return
    const id = setInterval(() => {
      setRf2PaidElapsedSec(Math.max(0, Math.floor((Date.now() - rf2PaidStartedAt) / 1000)))
    }, 250)
    return () => clearInterval(id)
  }, [rf2Busy, rf2PaidStartedAt])

  const filteredTxRows = txRows.filter((row) => {
    if (txModeFilter === 'all') return true
    return row.walletMode === txModeFilter
  })
  const txTotalPages = filteredTxRows.length === 0 ? 0 : Math.ceil(filteredTxRows.length / TX_LOG_PAGE_SIZE)
  const txPageSafe = txTotalPages === 0 ? 1 : Math.min(txPage, txTotalPages)
  const txPageStart = (txPageSafe - 1) * TX_LOG_PAGE_SIZE
  const txPageRows = filteredTxRows.slice(txPageStart, txPageStart + TX_LOG_PAGE_SIZE)

  const walletExplorer =
    session.wallet && session.wallet.startsWith('0x')
      ? explorerAddressUrl(session.network, session.wallet)
      : null

  const rf2ActionsDisabled = rf2Busy !== 'idle'

  return (
    <section className="grid">
      <article className="card">
        <h2>x402 settlement</h2>
        <p className="note">
          SNOMED intelligence demo: optional <strong>paid local RF2 search</strong>, <strong>paid concept detail</strong>
          , and <strong>paid Featherless summary</strong> of an RF2 concept with{' '}
          <strong>USDC {NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong> each (POST for x402 demo parity; free GET browse
          unchanged).
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

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Local RF2 browser (no Snowstorm required)</h2>
        <p className="note">
          Bespoke RF2 path for this demo: search by word or SCTID over local UK RF2 packages, then inspect concept-level
          details (FSN, synonyms, hierarchy snippets). Use <strong>Search RF2</strong> / <strong>Load concept</strong> for
          free GET, or the paid buttons for RF2 data via x402 POST. <strong>Featherless summary</strong> uses the SCTID
          field (paid POST; requires <code>FEATHERLESS_API_KEY</code> on the server).
        </p>
        <div className="actions" style={{ alignItems: 'center' }}>
          <button type="button" className="secondary" onClick={() => void runRf2Health()} disabled={rf2ActionsDisabled}>
            GET /api/snomed/rf2/health
          </button>
          <input
            value={rf2Query}
            onChange={(e) => setRf2Query(e.target.value)}
            placeholder="e.g. pregnancy or 289908002"
          />
          <button type="button" className="secondary" onClick={() => void runRf2Search()} disabled={rf2ActionsDisabled}>
            Search RF2
          </button>
          <button
            type="button"
            disabled={!session.wallet || rf2ActionsDisabled}
            onClick={() => void runPaidRf2Search()}
          >
            Run paid RF2 search ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          <input value={rf2Selected} onChange={(e) => setRf2Selected(e.target.value)} placeholder="SCTID" />
          <button type="button" className="secondary" onClick={() => void runRf2Lookup()} disabled={rf2ActionsDisabled}>
            Load concept
          </button>
          <button
            type="button"
            disabled={!session.wallet || rf2ActionsDisabled}
            onClick={() => void runPaidRf2Concept()}
          >
            Run paid load concept ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          <button
            type="button"
            disabled={!session.wallet || rf2ActionsDisabled}
            onClick={() => void runPaidFeatherlessSummary()}
          >
            Featherless summary ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
        </div>
        {rf2Busy !== 'idle' ? (
          <p className="note" style={{ color: '#1d4ed8' }}>
            {rf2Busy === 'health'
              ? 'Checking RF2 index health...'
              : rf2Busy === 'search'
                ? 'Searching local RF2 index...'
                : rf2Busy === 'paidSearch'
                  ? `Paid RF2 search (x402)… ${rf2PaidElapsedSec}s`
                  : rf2Busy === 'paidConcept'
                    ? `Paid RF2 concept load (x402)… ${rf2PaidElapsedSec}s`
                    : rf2Busy === 'paidFeatherless'
                      ? `Featherless summary (x402)… ${rf2PaidElapsedSec}s`
                      : 'Loading RF2 concept details...'}
          </p>
        ) : null}
        {rf2Error ? <p className="note" style={{ color: '#b45309' }}>{rf2Error}</p> : null}
        <div className="grid" style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(420px, 1.5fr)' }}>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>Results</h3>
            {rf2SearchOut.length === 0 ? (
              <p className="note">Run search to list matching concepts.</p>
            ) : (
              <div className="tx-table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>SCTID</th>
                      <th>Term</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rf2SearchOut.map((row) => (
                      <tr
                        key={row.conceptId}
                        style={{ cursor: 'pointer' }}
                        onClick={() => void runRf2Lookup(row.conceptId)}
                      >
                        <td>
                          <code>{row.conceptId}</code>
                        </td>
                        <td>{row.preferredTerm || row.fsn || '—'}</td>
                        <td>{row.active ? 'Active' : 'Inactive'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>Concept details</h3>
            {rf2ConceptOut ? (
              <>
                <div className="actions" role="tablist" aria-label="RF2 concept detail tabs">
                  <button
                    type="button"
                    className={rf2DetailTab === 'summary' ? 'primary' : 'secondary'}
                    onClick={() => setRf2DetailTab('summary')}
                  >
                    Summary
                  </button>
                  <button
                    type="button"
                    className={rf2DetailTab === 'descriptions' ? 'primary' : 'secondary'}
                    onClick={() => setRf2DetailTab('descriptions')}
                  >
                    Descriptions ({rf2ConceptOut.descriptions.length})
                  </button>
                  <button
                    type="button"
                    className={rf2DetailTab === 'hierarchy' ? 'primary' : 'secondary'}
                    onClick={() => setRf2DetailTab('hierarchy')}
                  >
                    Hierarchy
                  </button>
                </div>
                {rf2DetailTab === 'summary' ? (
                  <pre className="log">
                    {JSON.stringify(
                      {
                        conceptId: rf2ConceptOut.conceptId,
                        preferredTerm: rf2ConceptOut.preferredTerm,
                        fsn: rf2ConceptOut.fsn,
                        active: rf2ConceptOut.active,
                        moduleId: rf2ConceptOut.moduleId,
                        effectiveTime: rf2ConceptOut.effectiveTime,
                        definitionStatusId: rf2ConceptOut.definitionStatusId,
                        sourcePackage: rf2ConceptOut.sourcePackage,
                        parentCount: rf2ConceptOut.parents.length,
                        childCount: rf2ConceptOut.children.length,
                      },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
                {rf2DetailTab === 'descriptions' ? (
                  <pre className="log">{JSON.stringify(rf2ConceptOut.descriptions.slice(0, 120), null, 2)}</pre>
                ) : null}
                {rf2DetailTab === 'hierarchy' ? (
                  <pre className="log">
                    {JSON.stringify(
                      {
                        parents: rf2ConceptOut.parents,
                        children: rf2ConceptOut.children,
                      },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
              </>
            ) : (
              <p className="note">No concept loaded yet.</p>
            )}
            {rf2FeatherlessOut ? (
              <>
                <h4 style={{ marginTop: '1rem', marginBottom: '0.35rem' }}>Featherless summary</h4>
                <pre className="log" style={{ maxHeight: 280, overflow: 'auto' }}>
                  {rf2FeatherlessOut}
                </pre>
              </>
            ) : null}
          </article>
        </div>
        <details style={{ marginTop: '0.65rem' }}>
          <summary>RF2 health payload</summary>
          <pre className="log">{rf2HealthOut || 'Run /api/snomed/rf2/health to inspect index status.'}</pre>
        </details>
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
      subtitle="Local RF2 terminology browse and search with optional USDC x402 paid POST on the same RF2 index."
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
