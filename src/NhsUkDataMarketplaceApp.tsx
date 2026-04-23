import { useCallback, useMemo, useState } from 'react'
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
type DatasetId = 'nhs_qa' | 'nhs_conversations' | 'medical_tasks'

type SearchRow = {
  dataset: string
  pseudo_id: string
  lsoa11: string | null
  score?: number
}

const TX_LOG_PAGE_SIZE = 10
const OPENGPT_REPO_URL = 'https://github.com/CogStack/OpenGPT'
const COGSTACK_NLP_REPO_URL = 'https://github.com/CogStack/cogstack-nlp'
const MEDCAT_PAPER_URL = 'https://arxiv.org/abs/2010.01165'
const COGSTACK_NIFI_REPO_URL = 'https://github.com/CogStack/CogStack-NiFi'
const FORESIGHT_REPO_URL = 'https://github.com/CogStack/Foresight'

const DATASET_CARDS: Array<{
  id: DatasetId
  title: string
  rows: number
  sourcePath: string
  promptId: string
  generatedVia: string
  downloadHref: string
  useCaseFit: string
}> = [
  {
    id: 'nhs_qa',
    title: 'NHS UK Q/A',
    rows: 24665,
    sourcePath: 'data/prepared_generated_data_for_nhs_uk_qa.csv',
    promptId: 'f53cf99826',
    generatedVia: 'Generated via OpenGPT using data available on the NHS UK Website.',
    downloadHref: 'data/prepared_generated_data_for_nhs_uk_qa.csv',
    useCaseFit: 'Patient-safe triage and self-care prompts for NHS front-door chat.',
  },
  {
    id: 'nhs_conversations',
    title: 'NHS UK Conversations',
    rows: 2354,
    sourcePath: 'data/prepared_generated_data_for_nhs_uk_conversations.csv',
    promptId: 'f4df95ec69',
    generatedVia: 'Generated via OpenGPT using data available on the NHS UK Website.',
    downloadHref: 'data/prepared_generated_data_for_nhs_uk_conversations.csv',
    useCaseFit: 'Multi-turn dialogue traces for continuity of care and escalation.',
  },
  {
    id: 'medical_tasks',
    title: 'Medical Task/Solution',
    rows: 4688,
    sourcePath: 'data/prepared_generated_data_for_medical_tasks.csv',
    promptId: '5755564c19',
    generatedVia: 'Generated via OpenGPT using GPT-4.',
    downloadHref: 'data/prepared_generated_data_for_medical_tasks.csv',
    useCaseFit: 'Structured care-task generation and explainable recommendation text.',
  },
]

function NhsUkDataMarketplaceGrid({
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
  const [busy, setBusy] = useState(false)
  const [activeAction, setActiveAction] = useState<'' | 'search' | 'summary'>('')
  const [selectedDataset, setSelectedDataset] = useState<DatasetId>('nhs_qa')
  const [query, setQuery] = useState('chest pain red flags')
  const [lsoa, setLsoa] = useState('')
  const [searchOut, setSearchOut] = useState('')
  const [summaryOut, setSummaryOut] = useState('')
  const [txRows, setTxRows] = useState<NhsTxItem[]>(() => listNhsTxHistoryHesScale(session.network))
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')
  const [txPage, setTxPage] = useState(1)

  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistoryHesScale(session.network))
    setTxPage(1)
  }, [session.network])

  const filteredTxRows = useMemo(
    () => txRows.filter((row) => (txModeFilter === 'all' ? true : row.walletMode === txModeFilter)),
    [txRows, txModeFilter],
  )
  const txTotalPages = filteredTxRows.length === 0 ? 0 : Math.ceil(filteredTxRows.length / TX_LOG_PAGE_SIZE)
  const txPageSafe = txTotalPages === 0 ? 1 : Math.min(txPage, txTotalPages)
  const txPageStart = (txPageSafe - 1) * TX_LOG_PAGE_SIZE
  const txPageRows = filteredTxRows.slice(txPageStart, txPageStart + TX_LOG_PAGE_SIZE)

  const selectedCard = DATASET_CARDS.find((d) => d.id === selectedDataset) ?? DATASET_CARDS[0]

  const runPaidSearch = async () => {
    if (!session.wallet) {
      setSearchOut('Connect a wallet for paid dataset search.')
      return
    }
    setBusy(true)
    setActiveAction('search')
    setSearchOut('')
    try {
      const res = await apiPost<{ rows?: SearchRow[]; searchMode?: string; emptyHint?: string | null }>(
        '/api/neighbourhood/uk/search',
        session.role,
        session.wallet,
        { q: query, dataset: selectedDataset, mode: 'auto', limit: 20, offset: 0 },
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
            selectedDataset: selectedCard.title,
            searchMode: res.data?.searchMode,
            count: res.data?.rows?.length ?? 0,
            rows: res.data?.rows ?? [],
          },
          null,
          2,
        ),
      )
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }

  const runPaidSummary = async () => {
    if (!session.wallet) {
      setSummaryOut('Connect a wallet for paid synthesis.')
      return
    }
    setBusy(true)
    setActiveAction('summary')
    setSummaryOut('')
    try {
      const res = await apiPost<{ summary?: string; model?: string }>(
        '/api/neighbourhood/scale/cross-summary',
        session.role,
        session.wallet,
        { lsoa: lsoa.trim() || undefined },
        { network: session.network },
      )
      if (!res.ok) {
        setSummaryOut(res.error)
        return
      }
      refreshTxLog()
      setSummaryOut(
        JSON.stringify(
          {
            selectedDataset: selectedCard.title,
            model: res.data?.model,
            summary: res.data?.summary,
          },
          null,
          2,
        ),
      )
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }

  const walletExplorer =
    session.wallet && session.wallet.startsWith('0x') ? explorerAddressUrl(session.network, session.wallet) : null

  return (
    <section className="grid">
      <article className="card">
        <h2>NHS UK + OpenGPT data lane</h2>
        <p className="note">
          This page packages NHS UK conversational datasets into a monetizable clinical AI flow with x402 settlement and
          USDC micropayments.
        </p>
        <p className="note">
          Source framework:{' '}
          <a href={OPENGPT_REPO_URL} target="_blank" rel="noreferrer">
            CogStack/OpenGPT
          </a>
          .
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="x402-fac-nhsuk" className="note">
            Provider
          </label>
          <select
            id="x402-fac-nhsuk"
            value={x402Provider}
            onChange={(e) => onX402ProviderChange(e.target.value as X402FacilitatorId)}
          >
            <option value="circle">Circle Gateway (batch + deposit)</option>
            <option value="thirdweb">Thirdweb (EIP-3009 exact)</option>
          </select>
        </div>
        <p className="note" style={{ marginTop: '0.75rem' }}>
          Active path: <strong>{payLabel}</strong>. Default ticket: <strong>USDC {NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong>
          .
        </p>
      </article>

      <article className="card">
        <h2>Dataset cards</h2>
        <label>
          Select dataset
          <select value={selectedDataset} onChange={(e) => setSelectedDataset(e.target.value as DatasetId)}>
            {DATASET_CARDS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <pre className="log">
          {JSON.stringify(
            {
              title: selectedCard.title,
              rows: selectedCard.rows,
              schema: ['text', 'raw_data_id'],
              promptId: selectedCard.promptId,
              generatedVia: selectedCard.generatedVia,
              sourcePath: selectedCard.sourcePath,
              useCaseFit: selectedCard.useCaseFit,
            },
            null,
            2,
          )}
        </pre>
        <p className="note">
          Download:{' '}
          <a href={selectedCard.downloadHref} download>
            {selectedCard.downloadHref}
          </a>
        </p>
      </article>

      <article className="card">
        <h2>CogStack synergy</h2>
        <p className="note">
          The paid lane composes dataset-grounded prompts with MedCAT concept extraction, NiFi pipeline orchestration, and
          Foresight-style longitudinal modeling.
        </p>
        <ul className="note" style={{ marginTop: '0.5rem' }}>
          <li>
            <a href={COGSTACK_NLP_REPO_URL} target="_blank" rel="noreferrer">
              CogStack NLP / MedCAT
            </a>{' '}
            for clinical concept annotation.
          </li>
          <li>
            <a href={MEDCAT_PAPER_URL} target="_blank" rel="noreferrer">
              MedCAT evidence paper
            </a>{' '}
            for multi-domain clinical NLP performance.
          </li>
          <li>
            <a href={COGSTACK_NIFI_REPO_URL} target="_blank" rel="noreferrer">
              CogStack NiFi
            </a>{' '}
            for orchestrated data pipelines.
          </li>
          <li>
            <a href={FORESIGHT_REPO_URL} target="_blank" rel="noreferrer">
              Foresight
            </a>{' '}
            for patient timeline generative modeling.
          </li>
        </ul>
      </article>

      <article className="card">
        <h2>Paid: retrieval microcall</h2>
        <p className="note">Run a paid search call to validate dataset-backed retrieval with USDC nanopayments.</p>
        <label>
          Query
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. sepsis signs in adults" />
        </label>
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runPaidSearch()}>
            Run paid retrieval ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'search' ? <p className="note">Running...</p> : null}
        </div>
        <pre className="log">{searchOut || 'No paid retrieval result yet.'}</pre>
      </article>

      <article className="card">
        <h2>Paid: synthesis microcall</h2>
        <p className="note">
          Generate a concise NHS-facing synthesis response (monetized endpoint) for operational triage intelligence.
        </p>
        <label>
          LSOA filter (optional)
          <input value={lsoa} onChange={(e) => setLsoa(e.target.value)} placeholder="e.g. E01022770" />
        </label>
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runPaidSummary()}>
            Run paid synthesis ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'summary' ? <p className="note">Running...</p> : null}
        </div>
        <pre className="log">{summaryOut || 'No paid synthesis result yet.'}</pre>
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
          <p className="note">No paid calls recorded yet for this dataset lane.</p>
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
                    row.txHash.length > 22 ? `${row.txHash.slice(0, 10)}...${row.txHash.slice(-8)}` : row.txHash
                  return (
                    <tr key={`${row.txHash}-${row.createdAt}-${row.endpoint}`}>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>
                        {row.walletMode === 'circle' ? (
                          <span className="tx-badge tx-badge--chain">Circle</span>
                        ) : row.walletMode === 'metamask' ? (
                          <span className="tx-badge tx-badge--audit">MetaMask</span>
                        ) : (
                          <span className="tx-muted">-</span>
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
                          <span className="tx-muted">-</span>
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

export default function NhsUkDataMarketplaceApp() {
  const [x402Provider, setX402Provider] = useState<X402FacilitatorId>(() => getX402FacilitatorPreference())
  const payLabel = x402Provider === 'thirdweb' ? 'thirdweb x402' : 'Circle Gateway x402'

  return (
    <NhsShell
      title="NHS UK data marketplace"
      subtitle="OpenGPT NHS datasets + USDC nanopayments on Arc Testnet for paid retrieval and synthesis."
    >
      {(session) => (
        <NhsUkDataMarketplaceGrid
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
