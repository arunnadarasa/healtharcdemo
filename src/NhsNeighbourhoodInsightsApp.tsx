import { useCallback, useEffect, useState } from 'react'
import NhsShell from './NhsShell'
import { apiPost, apiGet } from './nhsApi'
import type { NhsNetwork, NhsRole } from './nhsSession'
import {
  explorerAddressUrl,
  explorerUrl,
  listNhsTxHistoryNeighbourhoodInsights,
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

type HealthJson = {
  ok?: boolean
  sqlite?: { aeRows?: number; opRows?: number; apcRows?: number }
  ehrbase?: unknown
  note?: string
}

type IntegrationContext = {
  ok?: boolean
  time?: string
  hackathon?: {
    openEhr?: { summary?: string; bffPaths?: string[] }
    payments?: { summary?: string; chainId?: number; currency?: string }
    sampleData?: { summary?: string; ingest?: string }
    snomedCt?: {
      summary?: string
      browser?: string
      ihtsdoGithub?: string
      localRf2Path?: string
    }
  }
}

const DEFAULT_AQL = `SELECT e/ehr_id/value
FROM EHR e
LIMIT 10`

type NhsSession = { role: NhsRole; wallet: string; network: NhsNetwork }

const TX_LOG_PAGE_SIZE = 10
type TxModeFilter = 'all' | WalletMode

function NeighbourhoodInsightsGrid({
  session,
  payLabel,
  health,
  integration,
  x402Provider,
  onX402ProviderChange,
}: {
  session: NhsSession
  payLabel: string
  health: string
  integration: IntegrationContext | null
  x402Provider: X402FacilitatorId
  onX402ProviderChange: (v: X402FacilitatorId) => void
}) {
  const [lsoa, setLsoa] = useState('')
  const [aql, setAql] = useState(DEFAULT_AQL)
  const [out, setOut] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [activeAction, setActiveAction] = useState<'' | 'aql' | 'lsoa' | 'summary'>('')
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [txRows, setTxRows] = useState<NhsTxItem[]>(() =>
    listNhsTxHistoryNeighbourhoodInsights(session.network),
  )
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')
  const [txPage, setTxPage] = useState(1)

  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistoryNeighbourhoodInsights(session.network))
    setTxPage(1)
  }, [session.network])

  const filteredTxRows = txRows.filter((row) => {
    if (txModeFilter === 'all') return true
    return row.walletMode === txModeFilter
  })
  const txTotalPages = filteredTxRows.length === 0 ? 0 : Math.ceil(filteredTxRows.length / TX_LOG_PAGE_SIZE)
  const txPageSafe = txTotalPages === 0 ? 1 : Math.min(txPage, txTotalPages)
  const txPageStart = (txPageSafe - 1) * TX_LOG_PAGE_SIZE
  const txPageRows = filteredTxRows.slice(txPageStart, txPageStart + TX_LOG_PAGE_SIZE)

  const wallet = session.wallet

  useEffect(() => {
    if (!busy || requestStartedAt == null) return
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - requestStartedAt) / 1000)))
    }, 250)
    return () => clearInterval(id)
  }, [busy, requestStartedAt])

  return (
    <section className="grid">
      <article className="card">
        <h2>x402 settlement</h2>
        <p className="note">
          Paid <strong>OpenEHR</strong>, <strong>LSOA</strong>, and <strong>summary</strong> use your choice. NHS
          routes under <code>/api/nhs/</code> always use <strong>Circle Gateway</strong>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="x402-facilitator-select" className="note">
            Provider
          </label>
          <select
            id="x402-facilitator-select"
            value={x402Provider}
            onChange={(e) => onX402ProviderChange(e.target.value as X402FacilitatorId)}
          >
            <option value="circle">Circle Gateway (batch + deposit)</option>
            <option value="thirdweb">Thirdweb (EIP-3009 exact)</option>
          </select>
        </div>
        <p className="note" style={{ marginTop: '0.75rem' }}>
          <strong>Top bar balances:</strong> <strong>Wallet USDC</strong> is on-chain Arc USDC (viem <code>balanceOf</code>
          ). <strong>Gateway USDC</strong> is only USDC credited inside <strong>Circle Gateway</strong> for this app
          domain — it is <em>not</em> a &quot;Thirdweb balance&quot;; Thirdweb x402 settles from your <strong>wallet</strong>{' '}
          (EIP-3009), so with <strong>Thirdweb</strong> selected you should watch <strong>Wallet USDC</strong>;{' '}
          <strong>Gateway</strong> may stay flat unless you also deposit for Circle flows. Balances refresh about every{' '}
          <strong>45s</strong> or when you click <strong>Refresh</strong>.
        </p>
      </article>
      <article className="card">
        <h2>Hackathon integration</h2>
        <p className="note">
          <strong>OpenEHR</strong> via EHRbase AQL (server BFF). <strong>Arc</strong> chain{' '}
          <code>5042002</code>. <strong>USDC</strong> nanopayments via HTTP 402 / x402 ({payLabel}). Sample data:
          ingested artificial HES → SQLite for LSOA views.
        </p>
        {integration?.hackathon?.snomedCt?.browser ? (
          <p className="note">
            <strong>SNOMED CT:</strong>{' '}
            <a href={integration.hackathon.snomedCt.browser} target="_blank" rel="noreferrer">
              SNOMED International Browser
            </a>
            . Tooling org:{' '}
            <a href={integration.hackathon.snomedCt.ihtsdoGithub} target="_blank" rel="noreferrer">
              IHTSDO on GitHub
            </a>
            .
          </p>
        ) : null}
        {integration?.hackathon?.snomedCt?.localRf2Path ? (
          <p className="note" style={{ marginTop: '0.75rem' }}>
            <strong>Local SNOMED RF2:</strong> browse and search the indexed UK/international RF2 package in-app —{' '}
            <a href={integration.hackathon.snomedCt.localRf2Path}>SNOMED intelligence</a> (no Snowstorm required).
          </p>
        ) : null}
      </article>

      <article className="card">
        <h2>Data safety</h2>
        <p className="note">
          Artificial HES does not preserve relationships between fields (NHS Digital). This UI is for
          interoperability and nanopayment demos only — not validated population health models.
        </p>
      </article>

      <article className="card">
        <h2>Service health</h2>
        <pre className="log">{health || 'Loading…'}</pre>
      </article>

      <article className="card">
        <h2>Paid: OpenEHR AQL (EHRbase BFF)</h2>
        <p className="note">
          Primary <strong>openEHR</strong> path: server proxies AQL to EHRbase (credentials never in the
          browser). ≤ $0.01 per request on Arc Testnet ({payLabel}).
        </p>
        <textarea
          className="log"
          style={{ width: '100%', minHeight: '6rem' }}
          value={aql}
          onChange={(e) => setAql(e.target.value)}
        />
        <div className="actions">
          <button
            type="button"
            disabled={!session.wallet || busy}
            onClick={async () => {
              setActiveAction('aql')
              setRequestStartedAt(Date.now())
              setElapsedSec(0)
              setBusy(true)
              setOut('')
              const res = await apiPost<unknown>(
                '/api/openehr/query/aql',
                session.role,
                session.wallet,
                { q: aql.trim() },
                { network: session.network },
              )
              setOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
              if (res.ok) refreshTxLog()
              setBusy(false)
              setActiveAction('')
              setRequestStartedAt(null)
              setElapsedSec(0)
            }}
          >
            Run paid AQL
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const res = await apiGet<unknown>(
                '/api/openehr/health',
                session.role,
                session.wallet,
                { network: session.network },
              )
              setOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
            }}
          >
            Check EHRbase (unpaid)
          </button>
        </div>
      </article>

      <article className="card">
        <h2>Paid: LSOA aggregates (artificial HES)</h2>
        <p className="note">
          Synthetic sample data in SQLite — aligns with neighbourhood demand signals; responses include{' '}
          <strong>SNOMED CT</strong> reference hooks for interoperability demos.
        </p>
        <label>
          LSOA filter (optional)
          <input value={lsoa} onChange={(e) => setLsoa(e.target.value)} placeholder="e.g. E01022770" />
        </label>
        <div className="actions">
          <button
            type="button"
            disabled={!session.wallet || busy}
            onClick={async () => {
              setActiveAction('lsoa')
              setRequestStartedAt(Date.now())
              setElapsedSec(0)
              setBusy(true)
              setOut('')
              const res = await apiPost<unknown>(
                '/api/neighbourhood/insights/lsoa',
                session.role,
                session.wallet,
                { lsoa: lsoa.trim() || undefined },
                { network: session.network },
              )
              setOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
              if (res.ok) refreshTxLog()
              setBusy(false)
              setActiveAction('')
              setRequestStartedAt(null)
              setElapsedSec(0)
            }}
          >
            Run paid aggregate
          </button>
          {busy && activeAction === 'lsoa' ? (
            <p className="note" style={{ margin: 0 }}>
              Running LSOA aggregate… {elapsedSec}s elapsed
            </p>
          ) : null}
        </div>
      </article>

      <article className="card">
        <h2>Paid: LLM summary (Featherless)</h2>
        <p className="note">
          Narrative for neighbourhood teams; prompt includes openEHR + SNOMED framing. Requires{' '}
          <code>FEATHERLESS_API_KEY</code> on the server; optional <code>FEATHERLESS_MODEL</code> (default Qwen — some
          Llama models need Hugging Face linked in Featherless).
        </p>
        <div className="actions">
          <button
            type="button"
            disabled={!session.wallet || busy}
            onClick={async () => {
              setActiveAction('summary')
              setRequestStartedAt(Date.now())
              setElapsedSec(0)
              setBusy(true)
              setOut('')
              const res = await apiPost<unknown>(
                '/api/neighbourhood/insights/summary',
                session.role,
                session.wallet,
                { lsoa: lsoa.trim() || undefined },
                { network: session.network },
              )
              setOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
              if (res.ok) refreshTxLog()
              setBusy(false)
              setActiveAction('')
              setRequestStartedAt(null)
              setElapsedSec(0)
            }}
          >
            Run paid summary
          </button>
          {busy && activeAction === 'summary' ? (
            <p className="note" style={{ margin: 0 }}>
              Running summary… {elapsedSec}s elapsed
            </p>
          ) : null}
        </div>
      </article>

      {out ? (
        <article className="card">
          <h2>Last response</h2>
          <pre className="log">{out}</pre>
        </article>
      ) : null}

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Margin &amp; gas (why x402 on Arc)</h2>
        <p className="note">
          <strong>Traditional per-tx gas</strong> on many EVM networks can cost <strong>far more than a few cents</strong>{' '}
          of USDC for a single transfer. If each <strong>HTTP API call</strong> mapped 1:1 to a <strong>standalone</strong>{' '}
          on-chain payment at full user-paid gas, the <strong>fee would often exceed the price</strong> of a{' '}
          <strong>{NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong> micropayment — the product has <strong>negative margin</strong>{' '}
          unless you raise prices or stop charging per request.
        </p>
        <p className="note">
          This demo uses <strong>x402</strong> with <strong>USDC (EIP-3009)</strong> on <strong>Arc Testnet</strong>, plus{' '}
          <strong>Circle Gateway</strong> (batching / deposit) or <strong>Thirdweb</strong> (facilitator settlement) so the{' '}
          <strong>unit economics</strong> can work at micro prices: <strong>authorization</strong> and{' '}
          <strong>settlement</strong> are designed for <strong>high-volume, low-value</strong> API calls instead of paying{' '}
          full legacy-style gas <em>per click</em>.
        </p>
      </article>

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Transaction log (this page)</h2>
        <p className="note tx-note-tight">
          Successful paid POSTs to OpenEHR AQL, LSOA aggregate, and LLM summary are appended to{' '}
          <strong>local storage</strong> (same ledger as other NHS x402 flows). Current network:{' '}
          <code>{session.network}</code>. List price per call: <strong>{NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong> USDC (gate
          on server). <strong>On-chain</strong> rows link to Arcscan; <strong>Audit</strong> rows still reflect the same
          list price — they only lack a stored <code>/tx/</code> hash; use <em>Wallet on explorer</em> to find the payment.
        </p>
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
              <span className="note" style={{ margin: 0 }}>
                Page <strong>{txPageSafe}</strong> of <strong>{txTotalPages}</strong>
                {' · '}
                {filteredTxRows.length} shown · {txRows.length} total · Showing {txPageRows.length} of{' '}
                {filteredTxRows.length} (newest first)
              </span>
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
          <p className="note">
            No paid calls for this filter yet. Older rows created before this update may only appear under All modes.
          </p>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Mode</th>
                  <th>Endpoint</th>
                  <th>Type</th>
                  <th>Cost (list)</th>
                  <th>Reference</th>
                  <th>Explorer</th>
                </tr>
              </thead>
              <tbody>
                {txPageRows.map((row) => {
                  const kind = row.kind ?? (row.txHash.startsWith('0x') ? 'chain' : 'audit')
                  const costDisplay =
                    row.paidDisplay ?? paidDisplayForNeighbourhoodEndpoint(row.endpoint) ?? '—'
                  const txLink = explorerUrl(row.network, row.txHash)
                  const refLabel =
                    kind === 'audit' && row.auditRef
                      ? row.auditRef
                      : row.txHash.length > 22
                        ? `${row.txHash.slice(0, 10)}…${row.txHash.slice(-8)}`
                        : row.txHash
                  const walletExplorer = wallet ? explorerAddressUrl(row.network, wallet) : null
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
                        <span className={kind === 'chain' ? 'tx-badge tx-badge--chain' : 'tx-badge tx-badge--audit'}>
                          {kind === 'chain' ? 'On-chain' : 'Audit'}
                        </span>
                      </td>
                      <td>
                        <span title="Server-listed gate price for this paid route (not network gas shown separately)">
                          {costDisplay}
                        </span>
                      </td>
                      <td>
                        <code title={row.txHash}>{refLabel}</code>
                      </td>
                      <td className="tx-explorer-cell">
                        {txLink ? (
                          <a href={txLink} target="_blank" rel="noreferrer" title="Arc transaction detail">
                            View transaction
                          </a>
                        ) : walletExplorer ? (
                          <a
                            href={walletExplorer}
                            target="_blank"
                            rel="noreferrer"
                            title="Wallet on Arc explorer — find the payment in the transaction list"
                          >
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

export default function NhsNeighbourhoodInsightsApp() {
  const [health, setHealth] = useState<string>('')
  const [integration, setIntegration] = useState<IntegrationContext | null>(null)
  const [x402Provider, setX402Provider] = useState<X402FacilitatorId>(() => getX402FacilitatorPreference())

  useEffect(() => {
    void (async () => {
      try {
        const signal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(5000)
            : undefined
        const res = await fetch('/api/neighbourhood/insights/health', signal ? { signal } : undefined)
        const text = await res.text()
        if (!res.ok) {
          throw new Error(text ? `${res.status}: ${text.slice(0, 240)}` : `HTTP ${res.status}`)
        }
        const j = JSON.parse(text) as HealthJson
        setHealth(JSON.stringify(j, null, 2))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setHealth(
          JSON.stringify(
            {
              ok: false,
              error: `Service health unavailable: ${msg}`,
              hint: 'Ensure API is running on port 8787, then refresh.',
              time: new Date().toISOString(),
            },
            null,
            2,
          ),
        )
      }
    })()
  }, [])

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
        if (j?.hackathon) setIntegration(j)
      } catch {
        // Keep page usable even if context is temporarily unavailable during startup.
      }
    })()
  }, [])

  const payLabel = x402Provider === 'thirdweb' ? 'thirdweb x402' : 'Circle Gateway x402'

  return (
    <NhsShell
      title="Neighbourhood health plan"
      subtitle="OpenEHR (EHRbase) AQL, synthetic artificial HES aggregates, SNOMED CT browser links, Arc Testnet USDC via x402 — demo only."
    >
      {(session) => (
        <NeighbourhoodInsightsGrid
          key={session.network}
          session={session}
          payLabel={payLabel}
          health={health}
          integration={integration}
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
