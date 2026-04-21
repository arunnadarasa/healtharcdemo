import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchArcBalances, type ArcBalances } from './arcWalletBalances'
import {
  clearStoredWallet,
  getStoredNetwork,
  getStoredRole,
  getStoredWallet,
  setStoredNetwork,
  setStoredRole,
  setStoredWallet,
  type NhsNetwork,
  type NhsRole,
} from './nhsSession'

function navLinkClass(href: string, pathname: string) {
  const active = pathname === href
  return `secondary button-like${active ? ' nav-link--active' : ''}`
}

const PATH_CONTEXT: Record<string, string> = {
  '/': 'Home',
  '/nhs': 'Home',
  '/nhs/neighbourhood-insights': 'Neighbourhood health plan',
}

function whereYouAre(pathname: string): string {
  return PATH_CONTEXT[pathname] ?? 'Home'
}

type Props = {
  title: string
  subtitle: string
  children: (session: { role: NhsRole; wallet: string; network: NhsNetwork }) => ReactNode
}

function isRole(value: string): value is NhsRole {
  return value === 'patient' || value === 'gp' || value === 'nhc_provider'
}

const emptyBalances: ArcBalances = { walletUsdc: '—', gatewayUsdc: null, gatewayError: null }

export default function NhsShell({ title, subtitle, children }: Props) {
  const [role, setRole] = useState<NhsRole>(getStoredRole())
  const [wallet, setWallet] = useState<string>(getStoredWallet())
  const [network, setNetwork] = useState<NhsNetwork>(getStoredNetwork())
  const [err, setErr] = useState('')
  const [faucetStatus, setFaucetStatus] = useState('')
  const [balances, setBalances] = useState<ArcBalances | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceFetchErr, setBalanceFetchErr] = useState('')

  const session = useMemo(() => ({ role, wallet, network }), [role, wallet, network])
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
      setBalances(b)
    } catch (e) {
      setBalances(null)
      setBalanceFetchErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBalanceLoading(false)
    }
  }, [wallet])

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
              value={role}
              onChange={(event) => {
                const next = event.target.value
                if (!isRole(next)) return
                setRole(next)
                setStoredRole(next)
              }}
            >
              <option value="patient">patient</option>
              <option value="gp">gp</option>
              <option value="nhc_provider">nhc_provider</option>
            </select>
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
            {wallet ? (
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
            )}
            <button
              className="secondary"
              disabled={!wallet || network !== 'testnet'}
              onClick={requestTestnetFunds}
              title={network === 'testnet' ? 'Open Circle faucet for Arc testnet' : 'Switch to testnet for faucet'}
            >
              Get testnet funds
            </button>
            <a className={navLinkClass('/nhs', pathname)} href="/nhs">
              Home
            </a>
            <a className={navLinkClass('/nhs/neighbourhood-insights', pathname)} href="/nhs/neighbourhood-insights">
              Neighbourhood health plan
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
                        : 'Spendable via Circle Gateway for x402 batch payments (deposit from wallet if needed)'
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
