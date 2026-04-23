import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { fetchArcBalances, type ArcBalances } from './arcWalletBalances'
import { depositUsdcToGateway } from './arcGatewayDeposit'
import {
  clearStoredWallet,
  getStoredNetwork,
  getStoredWallet,
  setStoredNetwork,
  setStoredWallet,
  type NhsNetwork,
  type NhsRole,
} from './nhsSession'

type WalletMode = 'metamask' | 'circle'
type CircleWalletMeta = { walletId: string; walletSetId: string; address: string; blockchain?: string }

const WALLET_MODE_KEY = 'nhs_wallet_mode_v1'
const CIRCLE_WALLET_META_KEY = 'nhs_circle_wallet_meta_v1'

function getStoredWalletMode(): WalletMode {
  const raw = localStorage.getItem(WALLET_MODE_KEY)
  return raw === 'circle' ? 'circle' : 'metamask'
}

function setStoredWalletMode(mode: WalletMode) {
  localStorage.setItem(WALLET_MODE_KEY, mode)
}

function getStoredCircleWalletMeta(): CircleWalletMeta | null {
  const raw = localStorage.getItem(CIRCLE_WALLET_META_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CircleWalletMeta
    if (!parsed || typeof parsed.address !== 'string' || typeof parsed.walletId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function setStoredCircleWalletMeta(meta: CircleWalletMeta) {
  localStorage.setItem(CIRCLE_WALLET_META_KEY, JSON.stringify(meta))
}

function navLinkClass(href: string, pathname: string) {
  const active = pathname === href
  return `secondary button-like${active ? ' nav-link--active' : ''}`
}

const PATH_CONTEXT: Record<string, string> = {
  '/': 'Home',
  '/nhs': 'Home',
  '/nhs/neighbourhood-insights': 'Neighbourhood health plan',
  '/nhs/hes-scale': 'HES at scale',
  '/nhs/snomed-intelligence': 'SNOMED intelligence',
  '/nhs/dmd-intelligence': 'dm+d intelligence',
  '/nhs/uk-dataset-lane': 'NHS UK dataset lane',
  '/nhs/cdr': 'CDR (Confidential Data Rails)',
}

function whereYouAre(pathname: string): string {
  return PATH_CONTEXT[pathname] ?? 'Home'
}

type Props = {
  title: string
  subtitle: string
  children: (session: { role: NhsRole; wallet: string; network: NhsNetwork }) => ReactNode
}

const emptyBalances: ArcBalances = { walletUsdc: '—', gatewayUsdc: null, gatewayError: null }

/** Demo role sent to APIs (`x-user-role`); hackathon UI does not offer patient / NHC switching. */
const DEMO_ROLE: NhsRole = 'gp'

function formatUsdc6(value: bigint): string {
  const n = Number.parseFloat(formatUnits(value, 6))
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (abs >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

async function fetchCircleGatewayBalance(walletAddress: string): Promise<string> {
  const res = await fetch('/api/circle/gateway-balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  })
  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; balance?: string; error?: string; details?: unknown }
    | null
  if (!res.ok || !payload?.ok) {
    const details =
      typeof payload?.details === 'string'
        ? ` (${payload.details})`
        : payload?.details
          ? ` (${JSON.stringify(payload.details).slice(0, 180)})`
          : ''
    throw new Error(`${payload?.error || `Gateway balance request failed (HTTP ${res.status}).`}${details}`)
  }
  const raw = typeof payload.balance === 'string' ? payload.balance : '0'
  return formatUsdc6(parseUnits(raw, 6))
}

export default function NhsShell({ title, subtitle, children }: Props) {
  const [wallet, setWallet] = useState<string>(getStoredWallet())
  const [network, setNetwork] = useState<NhsNetwork>(getStoredNetwork())
  const [walletMode, setWalletMode] = useState<WalletMode>(getStoredWalletMode())
  const [circleWalletMeta, setCircleWalletMeta] = useState<CircleWalletMeta | null>(getStoredCircleWalletMeta())
  const [circleWalletBusy, setCircleWalletBusy] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [err, setErr] = useState('')
  const [faucetStatus, setFaucetStatus] = useState('')
  const [gatewayDepositAmount, setGatewayDepositAmount] = useState('1')
  const [gatewayDepositBusy, setGatewayDepositBusy] = useState(false)
  const [gatewayDepositStatus, setGatewayDepositStatus] = useState('')
  const [circleGatewayDepositBusy, setCircleGatewayDepositBusy] = useState(false)
  const [balances, setBalances] = useState<ArcBalances | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceFetchErr, setBalanceFetchErr] = useState('')

  const session = useMemo(() => ({ role: DEMO_ROLE, wallet, network }), [wallet, network])
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''

  const refreshBalances = useCallback(async () => {
    if (!wallet || !wallet.startsWith('0x')) {
      setBalances(null)
      setBalanceFetchErr('')
      return
    }
    setBalanceLoading(true)
    setBalanceFetchErr('')
    try {
      const b = await fetchArcBalances(wallet as `0x${string}`)
      if (walletMode === 'circle' && circleWalletMeta?.address) {
        try {
          const circleGatewayUsdc = await fetchCircleGatewayBalance(circleWalletMeta.address)
          setBalances({ ...b, gatewayUsdc: circleGatewayUsdc, gatewayError: null })
          return
        } catch (e) {
          setBalances({
            ...b,
            gatewayUsdc: null,
            gatewayError: e instanceof Error ? e.message : String(e),
          })
          return
        }
      }
      setBalances(b)
    } catch (e) {
      setBalances(null)
      setBalanceFetchErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBalanceLoading(false)
    }
  }, [wallet, walletMode, circleWalletMeta?.address])

  useEffect(() => {
    void refreshBalances()
  }, [refreshBalances])

  useEffect(() => {
    if (!wallet) return
    const t = window.setInterval(() => void refreshBalances(), 45000)
    return () => window.clearInterval(t)
  }, [wallet, refreshBalances])

  const connectWallet = async () => {
    setErr('')
    const provider = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<unknown> } }).ethereum
    if (!provider) {
      setErr('Wallet provider not found.')
      return
    }
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const selected = accounts?.[0]
      if (!selected) {
        setErr('No wallet account returned.')
        return
      }
      setWallet(selected)
      setStoredWallet(selected)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Wallet connection failed.')
    }
  }

  const disconnectWallet = () => {
    setWallet('')
    clearStoredWallet()
    setBalances(null)
    setBalanceFetchErr('')
    setErr('')
    setFaucetStatus('')
  }

  const createCircleWallet = async () => {
    setErr('')
    setFaucetStatus('')
    setCopyStatus('')
    setCircleWalletBusy(true)
    try {
      const res = await fetch('/api/circle/dev-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean
            walletSetId?: string
            walletId?: string
            address?: string
            blockchain?: string
            error?: string
            details?: unknown
          }
        | null

      if (!res.ok) {
        const details =
          payload?.details && typeof payload.details === 'string'
            ? ` (${payload.details})`
            : payload?.details
              ? ` (${JSON.stringify(payload.details).slice(0, 220)})`
              : ''
        setErr(`${payload?.error || `Circle wallet request failed (HTTP ${res.status}).`}${details}`)
        return
      }
      if (!payload?.walletId || !payload?.address || !payload?.walletSetId) {
        setErr('Circle wallet created but response was incomplete.')
        return
      }
      const meta: CircleWalletMeta = {
        walletId: payload.walletId,
        walletSetId: payload.walletSetId,
        address: payload.address,
        blockchain: payload.blockchain,
      }
      setCircleWalletMeta(meta)
      setStoredCircleWalletMeta(meta)
      setWalletMode('circle')
      setStoredWalletMode('circle')
      setWallet(meta.address)
      setStoredWallet(meta.address)
      setFaucetStatus(
        `Circle wallet ready (${meta.address.slice(0, 10)}…${meta.address.slice(-4)}). Fund it via Circle Faucet for Arc testnet.`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create Circle wallet.')
    } finally {
      setCircleWalletBusy(false)
    }
  }

  const requestTestnetFunds = () => {
    if (!wallet) {
      setFaucetStatus('Connect a wallet first.')
      return
    }
    if (network !== 'testnet') {
      setFaucetStatus('Faucet is testnet-only. Switch network to Arc testnet.')
      return
    }
    window.open('https://faucet.circle.com/', '_blank', 'noopener,noreferrer')
    setFaucetStatus('Opened Circle Faucet. Select Arc Testnet and paste your wallet address to request funds.')
  }

  const depositGatewayUsdc = async () => {
    setErr('')
    setGatewayDepositStatus('')
    if (!wallet || !wallet.startsWith('0x')) {
      setErr('Connect MetaMask wallet first to sign Gateway deposit.')
      return
    }
    const amount = gatewayDepositAmount.trim()
    if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
      setErr('Enter a valid USDC amount greater than 0.')
      return
    }
    const provider = (window as Window & {
      ethereum?: {
        request: (args: { method: string }) => Promise<unknown>
      }
    }).ethereum
    if (!provider) {
      setErr('Wallet provider not found.')
      return
    }

    setGatewayDepositBusy(true)
    try {
      // Ensure the browser wallet account matches the app wallet address.
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const selected = (accounts?.[0] || '').toLowerCase()
      if (!selected || selected !== wallet.toLowerCase()) {
        throw new Error('Selected MetaMask account does not match the active wallet chip.')
      }
      const result = await depositUsdcToGateway(provider, wallet as `0x${string}`, amount)
      setGatewayDepositStatus(
        `Gateway deposit submitted (${amount} USDC). depositTx=${result.depositTxHash}${result.approvalTxHash ? `, approvalTx=${result.approvalTxHash}` : ''}`,
      )
      await refreshBalances()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gateway deposit failed.')
    } finally {
      setGatewayDepositBusy(false)
    }
  }

  const depositCircleGatewayUsdc = async () => {
    setErr('')
    setGatewayDepositStatus('')
    if (!circleWalletMeta?.walletId || !circleWalletMeta.address) {
      setErr('Create a Circle wallet first.')
      return
    }
    const amount = gatewayDepositAmount.trim()
    if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
      setErr('Enter a valid USDC amount greater than 0.')
      return
    }

    setCircleGatewayDepositBusy(true)
    try {
      const res = await fetch('/api/circle/gateway-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: circleWalletMeta.walletId,
          walletAddress: circleWalletMeta.address,
          amount,
        }),
      })
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            details?: unknown
            approveTxHash?: string | null
            depositTxHash?: string | null
          }
        | null
      if (!res.ok || !payload?.ok) {
        const details =
          typeof payload?.details === 'string'
            ? ` (${payload.details})`
            : payload?.details
              ? ` (${JSON.stringify(payload.details).slice(0, 220)})`
              : ''
        setErr(`${payload?.error || `Circle Gateway deposit failed (HTTP ${res.status}).`}${details}`)
        return
      }
      setGatewayDepositStatus(
        `Circle Gateway top-up submitted (${amount} USDC).${payload.approveTxHash ? ` approvalTx=${payload.approveTxHash}` : ''}${payload.depositTxHash ? `, depositTx=${payload.depositTxHash}` : ''}`,
      )
      await refreshBalances()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Circle Gateway deposit failed.')
    } finally {
      setCircleGatewayDepositBusy(false)
    }
  }

  const copyWalletAddress = async (address: string) => {
    setCopyStatus('')
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(address)
      } else {
        // Fallback for environments without Clipboard API.
        const el = document.createElement('textarea')
        el.value = address
        el.setAttribute('readonly', '')
        el.style.position = 'absolute'
        el.style.left = '-9999px'
        document.body.appendChild(el)
        el.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(el)
        if (!ok) throw new Error('Copy command failed')
      }
      setCopyStatus(`Copied: ${address}`)
    } catch (e) {
      setCopyStatus(`Copy failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <div className="hero-heading">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="hero-appbar">
          <p className="hero-context" aria-live="polite">
            <span className="hero-context__label">Where you are</span>
            <span className="hero-context__value">{whereYouAre(pathname)}</span>
          </p>

          <div className="actions hero-toolbar">
            <select
              value={network}
              onChange={() => {
                setNetwork('testnet')
                setStoredNetwork('testnet')
              }}
            >
              <option value="testnet">Arc testnet</option>
            </select>
            <span
              className="hero-toolbar__badge"
              title="Paid routes use x402 (Circle Gateway or thirdweb) on Arc Testnet."
            >
              x402
            </span>
            <span className="hero-toolbar__badge" title="Choose which wallet flow to use in the app.">
              Wallet mode
            </span>
            <button
              type="button"
              className={walletMode === 'metamask' ? '' : 'secondary'}
              onClick={() => {
                setWalletMode('metamask')
                setStoredWalletMode('metamask')
                setErr('')
                setFaucetStatus('')
                if (!wallet || !wallet.startsWith('0x')) {
                  setWallet('')
                  clearStoredWallet()
                }
              }}
            >
              MetaMask
            </button>
            <button
              type="button"
              className={walletMode === 'circle' ? '' : 'secondary'}
              onClick={() => {
                setWalletMode('circle')
                setStoredWalletMode('circle')
                setErr('')
                setFaucetStatus('')
                if (circleWalletMeta?.address) {
                  setWallet(circleWalletMeta.address)
                  setStoredWallet(circleWalletMeta.address)
                } else {
                  setWallet('')
                  clearStoredWallet()
                }
              }}
            >
              Circle wallet
            </button>
            {walletMode === 'metamask' ? (
              wallet ? (
                <>
                  <span className="hero-wallet-chip" title={wallet}>
                    Wallet {wallet.slice(0, 10)}…{wallet.slice(-4)}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={disconnectWallet}
                    title="Forget this address in the app (wallet extension may still show this site as connected)"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button type="button" onClick={connectWallet}>
                  Connect wallet
                </button>
              )
            ) : (
              <>
                {circleWalletMeta?.address ? (
                  <>
                    <span className="hero-wallet-chip" title={circleWalletMeta.address}>
                      Circle {circleWalletMeta.address.slice(0, 10)}…{circleWalletMeta.address.slice(-4)}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void copyWalletAddress(circleWalletMeta.address)}
                      title="Copy Circle wallet address for Circle Faucet"
                    >
                      Copy address
                    </button>
                  </>
                ) : (
                  <span className="hero-toolbar__badge" title="No Circle wallet created yet.">
                    No Circle wallet yet
                  </span>
                )}
                <button type="button" className="secondary" onClick={() => void createCircleWallet()} disabled={circleWalletBusy}>
                  {circleWalletBusy ? 'Creating…' : circleWalletMeta ? 'Create new Circle wallet' : 'Create Circle wallet'}
                </button>
              </>
            )}
            <button
              className="secondary"
              disabled={!wallet || network !== 'testnet'}
              onClick={requestTestnetFunds}
              title={network === 'testnet' ? 'Open Circle faucet for Arc testnet' : 'Switch to testnet for faucet'}
            >
              Get testnet funds
            </button>
            <input
              value={gatewayDepositAmount}
              onChange={(e) => setGatewayDepositAmount(e.target.value)}
              placeholder="USDC"
              style={{ width: '6rem' }}
              title="USDC amount to deposit into Circle Gateway"
            />
            <button
              className="secondary"
              disabled={
                !wallet ||
                network !== 'testnet' ||
                walletMode !== 'metamask' ||
                gatewayDepositBusy ||
                circleGatewayDepositBusy
              }
              onClick={() => void depositGatewayUsdc()}
              title={
                walletMode === 'metamask'
                  ? 'Sign USDC approve/deposit with MetaMask'
                  : 'Switch to MetaMask mode to sign Gateway deposit'
              }
            >
              {gatewayDepositBusy ? 'Depositing…' : 'Deposit to Gateway'}
            </button>
            <button
              className="secondary"
              disabled={
                network !== 'testnet' ||
                walletMode !== 'circle' ||
                !circleWalletMeta?.walletId ||
                circleGatewayDepositBusy ||
                gatewayDepositBusy
              }
              onClick={() => void depositCircleGatewayUsdc()}
              title={
                walletMode === 'circle'
                  ? 'Submit Circle wallet approve/deposit to top up Gateway'
                  : 'Switch to Circle mode to top up Circle wallet Gateway balance'
              }
            >
              {circleGatewayDepositBusy ? 'Topping up…' : 'Top up Circle Gateway'}
            </button>
            {walletMode !== 'metamask' ? (
              <span className="note" style={{ margin: 0 }}>
                Circle mode can use <strong>Top up Circle Gateway</strong>; MetaMask mode can use <strong>Deposit to Gateway</strong>.
              </span>
            ) : null}
            <a className={navLinkClass('/nhs', pathname)} href="/nhs">
              Home
            </a>
            <a className={navLinkClass('/nhs/neighbourhood-insights', pathname)} href="/nhs/neighbourhood-insights">
              Neighbourhood health plan
            </a>
            <a className={navLinkClass('/nhs/hes-scale', pathname)} href="/nhs/hes-scale">
              HES at scale
            </a>
            <a className={navLinkClass('/nhs/snomed-intelligence', pathname)} href="/nhs/snomed-intelligence">
              SNOMED intelligence
            </a>
            <a className={navLinkClass('/nhs/dmd-intelligence', pathname)} href="/nhs/dmd-intelligence">
              dm+d intelligence
            </a>
            <a className={navLinkClass('/nhs/uk-dataset-lane', pathname)} href="/nhs/uk-dataset-lane">
              NHS UK dataset lane
            </a>
            <a className={navLinkClass('/nhs/cdr', pathname)} href="/nhs/cdr">
              CDR (Confidential Data Rails)
            </a>
          </div>

          {wallet ? (
            <div className="hero-balances" aria-live="polite">
              <div className="hero-balances__grid">
                <div className="hero-balance">
                  <span className="hero-balance__label">Wallet USDC</span>
                  <span className="hero-balance__value" title="On-chain USDC on Arc Testnet (faucet)">
                    {balanceLoading && !balances ? '…' : balances?.walletUsdc ?? emptyBalances.walletUsdc}
                  </span>
                </div>
                <div className="hero-balance">
                  <span className="hero-balance__label">Gateway USDC</span>
                  <span
                    className="hero-balance__value"
                    title={
                      balances?.gatewayError
                        ? balances.gatewayError
                        : 'Circle Gateway only — USDC deposited for batch x402. Thirdweb mode spends Wallet USDC on-chain; this line may not change.'
                    }
                  >
                    {balanceLoading && !balances ? (
                      '…'
                    ) : balances?.gatewayUsdc != null ? (
                      balances.gatewayUsdc
                    ) : balances?.gatewayError ? (
                      <span className="hero-balance__muted">—</span>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="secondary hero-balances__refresh"
                disabled={balanceLoading}
                onClick={() => void refreshBalances()}
                title="Refresh balances"
              >
                Refresh
              </button>
            </div>
          ) : (
            <p className="hero-balances__hint">Connect a wallet to see USDC balances (Arc Testnet).</p>
          )}
          {walletMode === 'circle' ? (
            <p className="note hero-appbar__feedback">
              Circle mode uses a server-created wallet. If Wallet USDC is funded but Gateway USDC is 0, use{' '}
              <strong>Top up Circle Gateway</strong> before paid x402 actions.
            </p>
          ) : null}
          {copyStatus ? <p className="note hero-appbar__feedback">{copyStatus}</p> : null}
          {gatewayDepositStatus ? <p className="note hero-appbar__feedback">{gatewayDepositStatus}</p> : null}
          {balanceFetchErr ? (
            <p className="note hero-appbar__feedback" style={{ marginTop: '0.35rem' }}>
              Balance: {balanceFetchErr}
            </p>
          ) : null}

          {err ? <p className="error hero-appbar__feedback">{err}</p> : null}
          {faucetStatus ? <p className="note hero-appbar__feedback">{faucetStatus}</p> : null}
        </div>
      </header>
      <div className="app-content">{children(session)}</div>
    </main>
  )
}
