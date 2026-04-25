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
type RunnerMode =
  | 'direct_onchain_transfer'
  | 'x402_circle_nanopayments'
  | 'circle_transfer_per_attempt'
type AttemptResult = {
  index: number
  mode: RunnerMode
  endpoint: string
  ok: boolean
  paymentStatus: 'paid' | 'failed'
  settlementObserved: boolean
  txHash: string | null
  circleTransferId: string | null
  transferState: string | null
  explorerUrl: string | null
  error: string | null
  batchIndex: number
  createdAt: string
}

const RUNNER_ATTEMPTS_KEY = 'nhs_onchain_runner_attempts_v1'
const RUNNER_PAGE_SIZE = 51
const CIRCLE_WALLET_META_KEY = 'nhs_circle_wallet_meta_v1'

/** Round-trip exports omitted `ok` for a while — infer mode/`ok` so imports and localStorage reload stay valid. */
function normalizeAttemptRow(input: Partial<AttemptResult> & { index?: unknown }): AttemptResult | null {
  if (typeof input.index !== 'number' || typeof input.createdAt !== 'string' || typeof input.endpoint !== 'string') {
    return null
  }
  let mode: RunnerMode
  if (
    input.mode === 'x402_circle_nanopayments' ||
    input.mode === 'direct_onchain_transfer' ||
    input.mode === 'circle_transfer_per_attempt'
  ) {
    mode = input.mode
  } else if (input.endpoint.startsWith('/api/')) {
    mode = 'x402_circle_nanopayments'
  } else {
    mode = 'direct_onchain_transfer'
  }
  const paymentStatus: 'paid' | 'failed' = input.paymentStatus === 'failed' ? 'failed' : 'paid'
  const ok =
    typeof input.ok === 'boolean' ? input.ok : paymentStatus === 'paid' && (input.error == null || input.error === '')
  return {
    index: input.index,
    mode,
    endpoint: input.endpoint,
    ok,
    paymentStatus,
    settlementObserved: Boolean(input.settlementObserved),
    txHash: input.txHash == null || input.txHash === '' ? null : String(input.txHash),
    circleTransferId:
      input.circleTransferId == null || input.circleTransferId === '' ? null : String(input.circleTransferId),
    transferState: input.transferState == null || input.transferState === '' ? null : String(input.transferState),
    explorerUrl: input.explorerUrl == null || input.explorerUrl === '' ? null : String(input.explorerUrl),
    error: input.error == null || input.error === '' ? null : String(input.error),
    batchIndex: typeof input.batchIndex === 'number' && Number.isFinite(input.batchIndex) ? input.batchIndex : 1,
    createdAt: input.createdAt,
  }
}

function getStoredCircleWalletId(): string | null {
  const raw = localStorage.getItem(CIRCLE_WALLET_META_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { walletId?: string }
    if (typeof parsed.walletId !== 'string' || !parsed.walletId.trim()) return null
    return parsed.walletId.trim()
  } catch {
    return null
  }
}

function loadStoredAttempts(): AttemptResult[] {
  const raw = localStorage.getItem(RUNNER_ATTEMPTS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as AttemptResult[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((row) => row && typeof row.index === 'number' && typeof row.createdAt === 'string')
      .map((row) => normalizeAttemptRow(row))
      .filter((row): row is AttemptResult => row !== null)
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

function runnerAttemptBadge(row: AttemptResult): { label: string; className: string } {
  if (!row.ok) {
    return { label: 'Failed', className: 'tx-badge tx-badge--audit' }
  }
  if (row.txHash) {
    return { label: 'Tx on-chain', className: 'tx-badge tx-badge--chain' }
  }
  if (row.mode === 'x402_circle_nanopayments') {
    return { label: 'Paid (x402)', className: 'tx-badge tx-badge--paid' }
  }
  if (row.mode === 'circle_transfer_per_attempt') {
    return { label: 'Circle transfer', className: 'tx-badge tx-badge--paid' }
  }
  return { label: 'OK', className: 'tx-badge tx-badge--chain' }
}

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

async function checkCircleTransferPreflight(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/circle/runner-transfer/preflight')
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      hints?: string[]
    }
    if (!res.ok || !body?.ok) {
      const hint = Array.isArray(body?.hints) && body.hints.length > 0 ? body.hints[0] : 'Circle transfer preflight failed.'
      return { ok: false, message: hint }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: toUiErrorMessage(error) }
  }
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
        circleTransferId: null,
        transferState: null,
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
          circleTransferId: null,
          transferState: null,
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
        circleTransferId: null,
        transferState: null,
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
        circleTransferId: null,
        transferState: null,
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
        circleTransferId: null,
        transferState: null,
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
      circleTransferId: null,
      explorerUrl: res.explorerUrl ?? (res.txHash ? toExplorerUrl(session.network, res.txHash) : null),
      error: null,
      batchIndex,
      createdAt: new Date().toISOString(),
    }
  }

  const runSingleCircleTransfer = async (index: number, batchIndex: number): Promise<AttemptResult> => {
    const walletId = getStoredCircleWalletId()
    if (!walletId) {
      return {
        index,
        mode: 'circle_transfer_per_attempt',
        endpoint: '/api/circle/runner-transfer',
        ok: false,
        paymentStatus: 'failed',
        settlementObserved: false,
        txHash: null,
        circleTransferId: null,
        explorerUrl: null,
        error: 'Circle wallet not found. Create a Circle wallet from the top bar first.',
        batchIndex,
        createdAt: new Date().toISOString(),
      }
    }
    try {
      const r = await fetch('/api/circle/runner-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId,
          amountMinor: 1,
          memo: `runner:${target.id}:attempt:${index}`,
        }),
      })
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        txHash?: string | null
        circleTransferId?: string | null
        error?: string
        details?: unknown
        transferState?: string | null
      }
      if (!r.ok || !body?.ok) {
        const detail = typeof body?.details === 'string' ? ` (${body.details})` : ''
        return {
          index,
          mode: 'circle_transfer_per_attempt',
          endpoint: '/api/circle/runner-transfer',
          ok: false,
          paymentStatus: 'failed',
          settlementObserved: false,
          txHash: null,
          circleTransferId: null,
          transferState: null,
          explorerUrl: null,
          error: `${body?.error || 'Circle runner transfer failed.'}${detail}`,
          batchIndex,
          createdAt: new Date().toISOString(),
        }
      }
      const txHash = typeof body.txHash === 'string' && body.txHash.startsWith('0x') ? body.txHash : null
      const circleTransferId = typeof body.circleTransferId === 'string' ? body.circleTransferId : null
      const transferState = typeof body.transferState === 'string' ? body.transferState : null
      let resolvedTxHash = txHash
      let resolvedState = transferState
      if (!resolvedTxHash && circleTransferId) {
        const statusRes = await fetch(`/api/circle/runner-transfer/status/${encodeURIComponent(circleTransferId)}`)
        const statusBody = (await statusRes.json().catch(() => ({}))) as {
          txHash?: string | null
          transferState?: string | null
        }
        if (statusRes.ok && typeof statusBody.txHash === 'string' && statusBody.txHash.startsWith('0x')) {
          resolvedTxHash = statusBody.txHash
        }
        if (statusRes.ok && typeof statusBody.transferState === 'string') {
          resolvedState = statusBody.transferState
        }
      }
      return {
        index,
        mode: 'circle_transfer_per_attempt',
        endpoint: '/api/circle/runner-transfer',
        ok: true,
        paymentStatus: 'paid',
        settlementObserved: Boolean(resolvedTxHash),
        txHash: resolvedTxHash,
        circleTransferId,
        transferState: resolvedState,
        explorerUrl: resolvedTxHash ? toExplorerUrl(session.network, resolvedTxHash) : null,
        error: null,
        batchIndex,
        createdAt: new Date().toISOString(),
      }
    } catch (error) {
      return {
        index,
        mode: 'circle_transfer_per_attempt',
        endpoint: '/api/circle/runner-transfer',
        ok: false,
        paymentStatus: 'failed',
        settlementObserved: false,
        txHash: null,
        circleTransferId: null,
        transferState: null,
        explorerUrl: null,
        error: toUiErrorMessage(error),
        batchIndex,
        createdAt: new Date().toISOString(),
      }
    }
  }

  const runSingle = async (index: number): Promise<AttemptResult> => {
    const effectiveBatchSize = Math.max(1, Number.parseInt(batchSize, 10) || 10)
    const batchIndex = Math.floor((index - 1) / effectiveBatchSize) + 1
    return mode === 'direct_onchain_transfer'
      ? runSingleDirect(index, batchIndex)
      : mode === 'x402_circle_nanopayments'
        ? runSingleNanopayment(index, batchIndex)
        : runSingleCircleTransfer(index, batchIndex)
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
    if (mode === 'circle_transfer_per_attempt' && !getStoredCircleWalletId()) {
      setRunStatus('Circle transfer mode requires a created Circle wallet (top bar).')
      return
    }
    if (mode === 'circle_transfer_per_attempt') {
      const preflight = await checkCircleTransferPreflight()
      if (!preflight.ok) {
        setRunStatus(`Circle transfer preflight failed: ${preflight.message || 'missing server config.'}`)
        return
      }
    }
    setBusy(true)
    setSmokePassed(false)
    setSummaryOut('')
    setRunStatus(
      mode === 'direct_onchain_transfer'
        ? 'Running x1 smoke in direct on-chain mode. Approve wallet prompts in MetaMask.'
        : mode === 'x402_circle_nanopayments'
          ? 'Running x1 smoke in Circle x402 nanopayment mode.'
          : 'Running x1 smoke in Circle transfer-per-attempt mode.',
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
            circleTransferId: result.circleTransferId,
            transferState: result.transferState,
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
    if (mode === 'circle_transfer_per_attempt' && !getStoredCircleWalletId()) {
      setRunStatus('Circle transfer mode requires a created Circle wallet (top bar).')
      return
    }
    if (mode === 'circle_transfer_per_attempt') {
      const preflight = await checkCircleTransferPreflight()
      if (!preflight.ok) {
        setRunStatus(`Circle transfer preflight failed: ${preflight.message || 'missing server config.'}`)
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
    const localCircleTransferIds: string[] = []
    try {
      for (let i = 1; i <= totalAttempts; i += 1) {
        if (stopRequestedRef.current) {
          setRunStatus(`Stopped at attempt ${i - 1}/${totalAttempts}.`)
          break
        }
        setRunStatus(
          mode === 'direct_onchain_transfer'
            ? `Running attempt ${i}/${totalAttempts} in direct on-chain mode. Approve wallet prompt.`
            : mode === 'x402_circle_nanopayments'
              ? `Running attempt ${i}/${totalAttempts} in Circle x402 nanopayment mode.`
              : `Running attempt ${i}/${totalAttempts} in Circle transfer-per-attempt mode.`,
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
        if (result.circleTransferId) localCircleTransferIds.push(result.circleTransferId)
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
              circleTransferCount: localCircleTransferIds.length,
              circleTransferIds: localCircleTransferIds,
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
      ok: row.ok,
      paymentStatus: row.paymentStatus,
      settlementObserved: row.settlementObserved,
      txHash: row.txHash,
      circleTransferId: row.circleTransferId,
      transferState: row.transferState,
      explorerUrl: row.explorerUrl,
      error: row.error,
      createdAt: row.createdAt,
    }))
    const paidSuccess = attempts.filter((item) => item.ok).length
    const chainTxCount = attempts.filter((item) => item.txHash && item.ok).length
    const circleTransferIds = attempts
      .map((item) => item.circleTransferId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    const summary = {
      generatedAt: new Date().toISOString(),
      wallet: session.wallet,
      network: session.network,
      mode,
      endpoint:
        mode === 'x402_circle_nanopayments'
          ? target.endpoint
          : mode === 'circle_transfer_per_attempt'
            ? '/api/circle/runner-transfer'
            : 'direct_onchain_transfer',
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
      circleTransferCount: circleTransferIds.length,
      circleTransferIds,
      dashboardMappingHint:
        'Match attempt rows by createdAt + circleTransferId in Circle Console transactions view for judge evidence.',
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
      const sanitized = rows
        .map((row) => (row && typeof row === 'object' ? normalizeAttemptRow(row as Partial<AttemptResult>) : null))
        .filter((row): row is AttemptResult => row !== null)
      if (sanitized.length === 0) {
        setRunStatus('Import failed: no valid attempts found in file.')
        return
      }
      setAttempts(sanitized)
      setAttemptPage(1)
      setViewMode('all')
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
          batched. Mode 3 runs <strong>Circle transfer per attempt</strong> to produce one Circle transfer record per run
          attempt when configured.
        </p>
        <p className="note">
          For strict hackathon proof, compare this list with your wallet on Arcscan and include both per-attempt hashes
          and explorer links.
        </p>
        <p className="note">
          Active wallet mode: {walletMode}. Direct mode requires MetaMask. Circle x402 mode can run with either wallet
          mode when x402 prerequisites are funded. Circle transfer mode requires saved Circle wallet metadata.
        </p>
      </article>

      <article className="card">
        <h2>Controls</h2>
        <label>
          Runner mode
          <select value={mode} onChange={(e) => setMode(e.target.value as RunnerMode)} disabled={busy}>
            <option value="direct_onchain_transfer">Direct on-chain transfer (strict tx per attempt)</option>
            <option value="x402_circle_nanopayments">Circle x402 nanopayments (batched settlement)</option>
            <option value="circle_transfer_per_attempt">Circle transfer per attempt (best dashboard evidence)</option>
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
        ) : mode === 'circle_transfer_per_attempt' ? (
          <p className="note" style={{ marginBottom: '0.5rem' }}>
            <strong>Circle transfer mode</strong> records transfer IDs for dashboard mapping.
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
                  <option value="circle_transfer_per_attempt">Circle transfer only</option>
                </select>
              </label>
            </div>
            <div className="actions" style={{ marginBottom: '0.65rem' }}>
              <button type="button" className="secondary" disabled={clampedPage <= 1} onClick={() => setAttemptPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span className="note" style={{ margin: 0 }}>
                Page {clampedPage}/{totalPages} · {RUNNER_PAGE_SIZE} per page · {pagedAttempts.length} on this page (
                {filteredAttempts.length} match filter)
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
                    <th>Circle transfer id</th>
                    <th>Transfer state</th>
                    <th>Tx hash</th>
                    <th>Explorer</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAttempts.map((row) => {
                    const badge = runnerAttemptBadge(row)
                    const paidX402NoHash =
                      row.mode === 'x402_circle_nanopayments' && row.ok && !row.txHash
                    return (
                      <tr key={`${row.index}-${row.createdAt}`}>
                        <td>{row.index}</td>
                        <td>
                          <span
                            className={badge.className}
                            title={
                              paidX402NoHash
                                ? 'Paid API call; per-request tx hash may be absent under batched settlement.'
                                : undefined
                            }
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td>
                          <code>{row.endpoint}</code>
                        </td>
                        <td title={row.createdAt}>{formatDateTime(row.createdAt)}</td>
                        <td>
                          <code>{row.circleTransferId || '—'}</code>
                        </td>
                        <td>
                          <code>{row.transferState || '—'}</code>
                        </td>
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
                    )
                  })}
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
