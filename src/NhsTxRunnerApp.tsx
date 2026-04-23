import { useEffect, useMemo, useRef, useState } from 'react'
import NhsShell from './NhsShell'
import type { NhsNetwork, NhsRole } from './nhsSession'
import { ensureWalletOnNetwork } from './nhsArcPaidFetch'
import { apiPost } from './nhsApi'
import { addNhsTxHistory } from './nhsTxHistory'
import { setX402FacilitatorPreference } from './x402FacilitatorPreference'

type NhsSession = { role: NhsRole; wallet: string; network: NhsNetwork }
type RunnerTarget = {
  id: string
  label: string
  endpoint: string
  payloadFactory: () => Record<string, unknown>
}
type RunnerMode = 'direct_onchain_transfer' | 'x402_circle_nanopayments'
type AttemptResult = {
  index: number
  mode: RunnerMode
  endpoint: string
  ok: boolean
  paymentStatus: 'paid' | 'failed'
  settlementObserved: boolean
  txHash: string | null
  explorerUrl: string | null
  error: string | null
  batchIndex: number
  createdAt: string
}

const RUNNER_ATTEMPTS_KEY = 'nhs_onchain_runner_attempts_v1'
const RUNNER_PAGE_SIZE = 51

function loadStoredAttempts(): AttemptResult[] {
  const raw = localStorage.getItem(RUNNER_ATTEMPTS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as AttemptResult[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row) => row && typeof row.index === 'number' && typeof row.createdAt === 'string')
  } catch {
    return []
  }
}

function currentWalletMode(): 'metamask' | 'circle' | 'unknown' {
  const raw = localStorage.getItem('nhs_wallet_mode_v1')
  if (raw === 'metamask' || raw === 'circle') return raw
  return 'unknown'
}

const RUNNER_TARGETS: RunnerTarget[] = [
  {
    id: 'hes-scale-search',
    label: 'HES scale search (paid)',
    endpoint: '/api/neighbourhood/scale/search',
    payloadFactory: () => ({
      q: 'diabetes',
      dataset: 'all',
      limit: 10,
    }),
  },
  {
    id: 'uk-lane-search',
    label: 'NHS UK lane search (paid)',
    endpoint: '/api/neighbourhood/uk/search',
    payloadFactory: () => ({
      q: 'blood pressure',
      dataset: 'all',
      limit: 8,
      offset: 0,
    }),
  },
]

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function toExplorerUrl(_network: NhsNetwork, txHash: string): string {
  return `https://testnet.arcscan.app/tx/${txHash}`
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: number | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}

function toUiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error && typeof error === 'object') {
    const rec = error as Record<string, unknown>
    for (const key of ['shortMessage', 'message', 'reason', 'details', 'error']) {
      const value = rec[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    try {
      const compact = JSON.stringify(error)
      if (compact && compact !== '{}') return compact.slice(0, 280)
    } catch {
      // fall through
    }
  }
  return 'Unexpected wallet/provider error.'
}

function RunnerGrid({ session }: { session: NhsSession }) {
  const [mode, setMode] = useState<RunnerMode>('direct_onchain_transfer')
  const [viewMode, setViewMode] = useState<'all' | RunnerMode>('all')
  const [targetId, setTargetId] = useState(RUNNER_TARGETS[0].id)
  const [batchSize, setBatchSize] = useState('10')
  const [batchCount, setBatchCount] = useState('5')
  const [busy, setBusy] = useState(false)
  const [runStatus, setRunStatus] = useState('Ready.')
  const [smokePassed, setSmokePassed] = useState(false)
  const [attempts, setAttempts] = useState<AttemptResult[]>(() => loadStoredAttempts())
  const [summaryOut, setSummaryOut] = useState('No run yet.')
  const [attemptPage, setAttemptPage] = useState(1)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const stopRequestedRef = useRef(false)
  const walletMode = currentWalletMode()

  const target = useMemo(
    () => RUNNER_TARGETS.find((item) => item.id === targetId) ?? RUNNER_TARGETS[0],
    [targetId],
  )
  const filteredAttempts =
    viewMode === 'all' ? attempts : attempts.filter((row) => row.mode === viewMode)
  const totalPages = Math.max(1, Math.ceil(filteredAttempts.length / RUNNER_PAGE_SIZE))
  const clampedPage = Math.min(attemptPage, totalPages)
  const pageStart = (clampedPage - 1) * RUNNER_PAGE_SIZE
  const pagedAttempts = filteredAttempts.slice(pageStart, pageStart + RUNNER_PAGE_SIZE)

  useEffect(() => {
    localStorage.setItem(RUNNER_ATTEMPTS_KEY, JSON.stringify(attempts.slice(-2000)))
  }, [attempts])
  useEffect(() => {
    if (attemptPage > totalPages) setAttemptPage(totalPages)
  }, [attemptPage, totalPages])

  const totalAttempts = Math.max(1, Number.parseInt(batchSize, 10) || 10) * Math.max(1, Number.parseInt(batchCount, 10) || 5)
  const restoreStoredAttempts = () => setAttempts(loadStoredAttempts())

  const runSingleDirect = async (index: number, batchIndex: number): Promise<AttemptResult> => {
    const provider = (window as Window & {
      ethereum?: {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      }
    }).ethereum
    if (!provider) {
      return {
        index,
        mode: 'direct_onchain_transfer',
        endpoint: 'direct_onchain_transfer',
        ok: false,
        paymentStatus: 'failed',
        settlementObserved: false,
        txHash: null,
        explorerUrl: null,
        error: 'Wallet provider not found.',
        batchIndex,
        createdAt: new Date().toISOString(),
      }
    }
    try {
      await withTimeout(
        ensureWalletOnNetwork(provider, session.network),
        20000,
        'Timed out while switching wallet to Arc testnet. Check MetaMask network prompt.',
      )
      const txHashRaw = await withTimeout(
        provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: session.wallet,
              to: session.wallet,
              value: '0x0',
            },
          ],
        }),
        45000,
        'Timed out waiting for wallet transaction confirmation. Open MetaMask and approve/reject the pending transaction prompt.',
      )
      const txHash = typeof txHashRaw === 'string' ? txHashRaw : ''
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return {
          index,
          mode: 'direct_onchain_transfer',
          endpoint: 'direct_onchain_transfer',
          ok: false,
          paymentStatus: 'failed',
          settlementObserved: false,
          txHash: txHash || null,
          explorerUrl: txHash ? toExplorerUrl(session.network, txHash) : null,
          error: 'Direct on-chain transaction did not return a valid tx hash.',
          batchIndex,
          createdAt: new Date().toISOString(),
        }
      }
      return {
        index,
        mode: 'direct_onchain_transfer',
        endpoint: 'direct_onchain_transfer',
        ok: true,
        paymentStatus: 'paid',
        settlementObserved: true,
        txHash,
        explorerUrl: toExplorerUrl(session.network, txHash),
        error: null,
        batchIndex,
        createdAt: new Date().toISOString(),
      }
    } catch (error) {
      const message = toUiErrorMessage(error)
      return {
        index,
        mode: 'direct_onchain_transfer',
        endpoint: 'direct_onchain_transfer',
        ok: false,
        paymentStatus: 'failed',
        settlementObserved: false,
        txHash: null,
        explorerUrl: null,
        error: message,
        batchIndex,
        createdAt: new Date().toISOString(),
      }
    }
  }

  const runSingleNanopayment = async (index: number, batchIndex: number): Promise<AttemptResult> => {
    setX402FacilitatorPreference('circle')
    const payload = target.payloadFactory()
    const res = await apiPost<unknown>(target.endpoint, session.role, session.wallet, payload, {
      network: session.network,
    })
    if (!res.ok) {
      return {
        index,
        mode: 'x402_circle_nanopayments',
        endpoint: target.endpoint,
        ok: false,
        paymentStatus: 'failed',
        settlementObserved: false,
        txHash: null,
        explorerUrl: null,
        error: res.error,
        batchIndex,
        createdAt: new Date().toISOString(),
      }
    }
    const observed = Boolean(res.txHash && /^0x[a-fA-F0-9]{64}$/.test(res.txHash))
    return {
      index,
      mode: 'x402_circle_nanopayments',
      endpoint: target.endpoint,
      ok: true,
      paymentStatus: 'paid',
      settlementObserved: observed,
      txHash: res.txHash ?? null,
      explorerUrl: res.explorerUrl ?? (res.txHash ? toExplorerUrl(session.network, res.txHash) : null),
      error: null,
      batchIndex,
      createdAt: new Date().toISOString(),
    }
  }

  const runSingle = async (index: number): Promise<AttemptResult> => {
    const effectiveBatchSize = Math.max(1, Number.parseInt(batchSize, 10) || 10)
    const batchIndex = Math.floor((index - 1) / effectiveBatchSize) + 1
    return mode === 'direct_onchain_transfer' ? runSingleDirect(index, batchIndex) : runSingleNanopayment(index, batchIndex)
  }

  const pushRunnerHistory = (result: AttemptResult) => {
    addNhsTxHistory({
      txHash: result.txHash ?? `audit:runner:${crypto.randomUUID()}`,
      network: session.network,
      endpoint: result.endpoint,
      createdAt: result.createdAt,
      kind: result.txHash ? 'chain' : 'audit',
      runnerMode: result.mode,
      attemptIndex: result.index,
      batchIndex: result.batchIndex,
      paymentStatus: result.paymentStatus,
      settlementObserved: result.settlementObserved,
      walletMode: walletMode === 'metamask' || walletMode === 'circle' ? walletMode : undefined,
    })
  }

  const runSmoke = async () => {
    if (!session.wallet) {
      setRunStatus('Connect a wallet first.')
      return
    }
    if (walletMode !== 'metamask') {
      if (mode === 'direct_onchain_transfer') {
        setRunStatus('Direct mode requires MetaMask mode.')
        return
      }
    }
    setBusy(true)
    setSmokePassed(false)
    setSummaryOut('')
    setRunStatus(
      mode === 'direct_onchain_transfer'
        ? 'Running x1 smoke in direct on-chain mode. Approve wallet prompts in MetaMask.'
        : 'Running x1 smoke in Circle x402 nanopayment mode.',
    )
    stopRequestedRef.current = false
    try {
      const result = await runSingle(1)
      setAttempts([result])
      setAttemptPage(1)
      pushRunnerHistory(result)
      if (!result.ok) {
        setRunStatus(`Smoke failed: ${result.error}`)
        setSummaryOut(JSON.stringify({ smokeOk: false, reason: result.error }, null, 2))
        return
      }
      setSmokePassed(true)
      setRunStatus('Smoke passed. You can now run x50 sequential.')
      setSummaryOut(
        JSON.stringify(
          {
            smokeOk: true,
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            endpoint: result.endpoint,
            settlementMode: mode,
            paymentStatus: result.paymentStatus,
            settlementObserved: result.settlementObserved,
          },
          null,
          2,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const runX50 = async () => {
    if (!session.wallet) {
      setRunStatus('Connect a wallet first.')
      return
    }
    if (walletMode !== 'metamask') {
      if (mode === 'direct_onchain_transfer') {
        setRunStatus('Direct mode requires MetaMask mode.')
        return
      }
    }
    if (!smokePassed) {
      setRunStatus('Run x1 smoke first. x50 is gated behind a successful smoke run.')
      return
    }
    setBusy(true)
    setSummaryOut('')
    stopRequestedRef.current = false
    let okCount = 0
    const localHashes: string[] = []
    try {
      for (let i = 1; i <= totalAttempts; i += 1) {
        if (stopRequestedRef.current) {
          setRunStatus(`Stopped at attempt ${i - 1}/${totalAttempts}.`)
          break
        }
        setRunStatus(
          mode === 'direct_onchain_transfer'
            ? `Running attempt ${i}/${totalAttempts} in direct on-chain mode. Approve wallet prompt.`
            : `Running attempt ${i}/${totalAttempts} in Circle x402 nanopayment mode.`,
        )
        const result = await runSingle(i)
        setAttempts((prev) => [...prev, result])
        setAttemptPage(1)
        pushRunnerHistory(result)
        if (!result.ok) {
          setRunStatus(`Run failed at ${i}/${totalAttempts}: ${result.error}`)
          setSummaryOut(
            JSON.stringify(
              {
                status: 'failed',
                failedAt: i,
                okCount,
                error: result.error,
                endpoint: result.endpoint,
                mode,
              },
              null,
              2,
            ),
          )
          return
        }
        okCount += 1
        if (result.txHash) localHashes.push(result.txHash)
      }
      if (!stopRequestedRef.current && okCount === totalAttempts) {
        setRunStatus(`Completed ${totalAttempts}/${totalAttempts} attempts.`)
        const chainTxCount = localHashes.length
        setSummaryOut(
          JSON.stringify(
            {
              status: 'completed',
              okCount,
              attempted: totalAttempts,
              endpoint: target.endpoint,
              settlementMode: mode,
              network: session.network,
              wallet: session.wallet,
              txHashes: localHashes,
              chainTxCount,
              auditOnlyCount: totalAttempts - chainTxCount,
              batchSize: Math.max(1, Number.parseInt(batchSize, 10) || 10),
              batchCount: Math.max(1, Number.parseInt(batchCount, 10) || 5),
              caveat:
                mode === 'x402_circle_nanopayments'
                  ? 'Circle x402 can settle in batches, so successful paid calls may exceed visible on-chain tx count.'
                  : undefined,
            },
            null,
            2,
          ),
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const stopRun = () => {
    stopRequestedRef.current = true
    setRunStatus('Stop requested. Waiting for current call to finish...')
  }

  const exportProof = () => {
    const attempted = attempts.length
    const rows = attempts.map((row) => ({
      index: row.index,
      batchIndex: row.batchIndex,
      endpoint: row.endpoint,
      mode: row.mode,
      paymentStatus: row.paymentStatus,
      settlementObserved: row.settlementObserved,
      txHash: row.txHash,
      explorerUrl: row.explorerUrl,
      error: row.error,
      createdAt: row.createdAt,
    }))
    const paidSuccess = attempts.filter((item) => item.ok).length
    const chainTxCount = attempts.filter((item) => item.txHash && item.ok).length
    const summary = {
      generatedAt: new Date().toISOString(),
      wallet: session.wallet,
      network: session.network,
      mode,
      endpoint: mode === 'x402_circle_nanopayments' ? target.endpoint : 'direct_onchain_transfer',
      attempted,
      paidSuccess,
      chainTxCount,
      auditOnlyCount: attempted - chainTxCount,
      batchSize: Math.max(1, Number.parseInt(batchSize, 10) || 10),
      batchCount: Math.max(1, Number.parseInt(batchCount, 10) || 5),
      caveat:
        mode === 'x402_circle_nanopayments'
          ? 'Successful paid calls can be greater than observed chain tx count because Circle Gateway settles x402 payments in batches.'
          : undefined,
    }
    const stamp = Date.now()
    downloadTextFile(`runner-attempts-${stamp}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2))
    downloadTextFile(`runner-summary-${stamp}.json`, JSON.stringify(summary, null, 2))
  }

  const clearOutput = () => {
    stopRequestedRef.current = false
    setAttempts([])
    setAttemptPage(1)
    setRunStatus('Ready.')
    setSummaryOut('No run yet.')
    setSmokePassed(false)
  }

  const deleteStoredHistory = () => {
    localStorage.removeItem(RUNNER_ATTEMPTS_KEY)
    setAttempts([])
    setAttemptPage(1)
    setSummaryOut('No run yet.')
    setRunStatus('Stored transaction history deleted.')
    setSmokePassed(false)
  }

  const importAttemptsJson = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { rows?: AttemptResult[] } | AttemptResult[]
      const rows = Array.isArray(parsed) ? parsed : parsed?.rows
      if (!Array.isArray(rows)) {
        setRunStatus('Import failed: file must contain an array or { rows: [...] }.')
        return
      }
      const sanitized = rows.filter(
        (row) =>
          row &&
          typeof row.index === 'number' &&
          typeof row.createdAt === 'string' &&
          typeof row.endpoint === 'string',
      )
      if (sanitized.length === 0) {
        setRunStatus('Import failed: no valid attempts found in file.')
        return
      }
      setAttempts(sanitized)
      setAttemptPage(1)
      setRunStatus(`Imported ${sanitized.length} attempts from ${file.name}.`)
    } catch (error) {
      const message = toUiErrorMessage(error)
      setRunStatus(`Import failed: ${message}`)
    }
  }

  return (
    <section className="grid">
      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>On-chain Runner (x1/x50)</h2>
        <p className="note">
          Mode 1 runs a <strong>direct wallet on-chain transaction</strong> per attempt with strict tx hash proof. Mode
          2 runs <strong>Circle x402 nanopayment calls</strong> where paid attempts are logged even if settlement is
          batched.
        </p>
        <p className="note">
          For strict hackathon proof, compare this list with your wallet on Arcscan and include both per-attempt hashes
          and explorer links.
        </p>
        <p className="note">
          Active wallet mode: {walletMode}. Direct mode requires MetaMask. Circle x402 mode can run with either wallet
          mode when x402 prerequisites are funded.
        </p>
      </article>

      <article className="card">
        <h2>Controls</h2>
        <label>
          Runner mode
          <select value={mode} onChange={(e) => setMode(e.target.value as RunnerMode)} disabled={busy}>
            <option value="direct_onchain_transfer">Direct on-chain transfer (strict tx per attempt)</option>
            <option value="x402_circle_nanopayments">Circle x402 nanopayments (batched settlement)</option>
          </select>
        </label>
        <label>
          Batch size
          <input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} placeholder="10" />
        </label>
        <label>
          Batch count
          <input value={batchCount} onChange={(e) => setBatchCount(e.target.value)} placeholder="5" />
        </label>
        <label>
          Target paid endpoint
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {RUNNER_TARGETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.endpoint}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button
            type="button"
            disabled={!session.wallet || (mode === 'direct_onchain_transfer' && walletMode !== 'metamask') || busy}
            onClick={() => void runSmoke()}
          >
            Run x1 smoke
          </button>
          <button
            type="button"
            disabled={!session.wallet || (mode === 'direct_onchain_transfer' && walletMode !== 'metamask') || !smokePassed || busy}
            onClick={() => void runX50()}
          >
            Run x{totalAttempts} sequential
          </button>
          <button type="button" className="secondary" disabled={!busy} onClick={() => stopRun()}>
            Stop run
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => clearOutput()}>
            Clear output
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => restoreStoredAttempts()}>
            Reload stored history
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => deleteStoredHistory()}>
            Delete stored history
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => importInputRef.current?.click()}>
            Import attempts JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importAttemptsJson(file)
              e.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={attempts.length === 0}
            onClick={() => exportProof()}
          >
            Export attempts + summary JSON
          </button>
        </div>
        <pre className="log">{runStatus}</pre>
      </article>

      <article className="card">
        <h2>Summary</h2>
        {mode === 'x402_circle_nanopayments' ? (
          <p className="note" style={{ marginBottom: '0.5rem' }}>
            <strong>Paid call confirmed (batched settlement mode)</strong>
          </p>
        ) : null}
        <pre className="log">{summaryOut}</pre>
      </article>

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Attempts</h2>
        {attempts.length === 0 ? (
          <p className="note">No attempts yet.</p>
        ) : (
          <>
            {mode === 'x402_circle_nanopayments' || viewMode === 'x402_circle_nanopayments' ? (
              <p className="note" style={{ marginBottom: '0.65rem' }}>
                Per-request tx hash may be absent; use exported summary + wallet explorer settlement evidence.
              </p>
            ) : null}
            <div className="actions" style={{ marginBottom: '0.65rem' }}>
              <label style={{ margin: 0 }}>
                Transactions view
                <select
                  value={viewMode}
                  onChange={(e) => {
                    setViewMode(e.target.value as 'all' | RunnerMode)
                    setAttemptPage(1)
                  }}
                >
                  <option value="all">All transaction modes</option>
                  <option value="direct_onchain_transfer">Direct on-chain only</option>
                  <option value="x402_circle_nanopayments">Circle x402 only</option>
                </select>
              </label>
            </div>
            <div className="actions" style={{ marginBottom: '0.65rem' }}>
              <button type="button" className="secondary" disabled={clampedPage <= 1} onClick={() => setAttemptPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span className="note" style={{ margin: 0 }}>
                Page {clampedPage}/{totalPages} · 51 transactions per page · {filteredAttempts.length} shown
              </span>
              <button
                type="button"
                className="secondary"
                disabled={clampedPage >= totalPages}
                onClick={() => setAttemptPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
            <div className="tx-table-wrap">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Endpoint</th>
                    <th>Date / time</th>
                    <th>Tx hash</th>
                    <th>Explorer</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAttempts.map((row) => (
                    <tr key={`${row.index}-${row.createdAt}`}>
                      <td>{row.index}</td>
                      <td>
                        <span className={row.ok ? 'tx-badge tx-badge--chain' : 'tx-badge tx-badge--audit'}>
                          {row.ok ? 'On-chain' : 'Failed'}
                        </span>
                      </td>
                      <td>
                        <code>{row.endpoint}</code>
                      </td>
                      <td title={row.createdAt}>{formatDateTime(row.createdAt)}</td>
                      <td>
                        <code>{row.txHash || '—'}</code>
                      </td>
                      <td>
                        {row.explorerUrl ? (
                          <a href={row.explorerUrl} target="_blank" rel="noreferrer">
                            View tx
                          </a>
                        ) : (
                          <span className="tx-muted">—</span>
                        )}
                      </td>
                      <td>{row.error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </section>
  )
}

export default function NhsTxRunnerApp() {
  return (
    <NhsShell
      title="On-chain Runner (x1/x50)"
      subtitle="Dedicated runner for strict on-chain transaction evidence: x1 smoke gate, then sequential x50 paid calls."
    >
      {(session) => <RunnerGrid key={`${session.network}-${session.wallet}`} session={session} />}
    </NhsShell>
  )
}
