import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  ensureSelectedWalletNetwork,
  extractHexHash,
  getErrorMessage,
  httpFailureMessage,
  liveX402Fetch,
  mapLivePayError,
  parseResponseJson,
  type DanceLiveNetwork,
} from '../danceExtrasLiveX402'
import { judgePayload } from '../danceExtrasJudgeWire'

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}

type NetworkChromeProps = {
  network: DanceLiveNetwork
  onNetwork: (n: DanceLiveNetwork) => void
  panelId: string
}

/** Testnet / mainnet tabs + risk callouts (dance-extras live judge wire). */
export function DanceExtrasJudgeWireNetworkChrome({ network, onNetwork, panelId }: NetworkChromeProps) {
  return (
    <>
      <div className="doc-tabs" role="tablist" aria-label="Network">
        <button
          type="button"
          role="tab"
          aria-selected={network === 'testnet'}
          aria-controls={panelId}
          id={`${panelId}-tab-testnet`}
          onClick={() => onNetwork('testnet')}
        >
          Testnet (5042002)
        </button>
        <button
          type="button"
          className="doc-tabs__danger"
          role="tab"
          aria-selected={network === 'mainnet'}
          aria-controls={panelId}
          id={`${panelId}-tab-mainnet`}
          onClick={() => onNetwork('mainnet')}
        >
          Mainnet label (demo)
        </button>
      </div>

      {network === 'mainnet' ? (
        <div className="doc-alert doc-alert--danger" role="alert">
          <span className="doc-alert__icon" aria-hidden>
            ⚠️
          </span>
          <div>
            <strong>Real funds.</strong> Confirm <code>X402_SELLER_ADDRESS</code> / seller config, wallet balance, and
            intent to pay before using mainnet-labelled routes.
          </div>
        </div>
      ) : (
        <div className="doc-alert doc-alert--warn">
          <span className="doc-alert__icon" aria-hidden>
            ✓
          </span>
          <div>
            <strong>Safe default.</strong> Path <code>…/judge-score/testnet</code> — expect Arc Testnet (
            <code>eip155:5042002</code>) in payment output.
          </div>
        </div>
      )}
    </>
  )
}

type BrowserPanelProps = {
  network: DanceLiveNetwork
  /** Shown under the panel title */
  lede: ReactNode
}

/** Wire check (402) + browser wallet x402 pay — same as /dance-extras live. */
export function DanceExtrasJudgeWireBrowserPanel({ network, lede }: BrowserPanelProps) {
  const [walletAddress, setWalletAddress] = useState('')
  const [walletBusy, setWalletBusy] = useState(false)
  const [wireLoading, setWireLoading] = useState(false)
  const [wireStatus, setWireStatus] = useState('')
  const [wirePreview, setWirePreview] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')
  const [paySummary, setPaySummary] = useState('')

  const runWireCheck = async () => {
    setWireLoading(true)
    setWireStatus('')
    setWirePreview('')
    try {
      const res = await fetch(`/api/dance-extras/live/judge-score/${network}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(judgePayload(network)),
      })
      const text = await res.text()
      setWireStatus(`${res.status} ${res.statusText}`)
      setWirePreview(text.length > 6000 ? `${text.slice(0, 6000)}…` : text)
    } catch (err) {
      setWireStatus('Error')
      setWirePreview(getErrorMessage(err))
    } finally {
      setWireLoading(false)
    }
  }

  const connectWallet = async () => {
    setWalletBusy(true)
    setPayError('')
    try {
      if (!window.ethereum) throw new Error('Injected wallet not found (e.g. MetaMask).')
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
      if (!accounts?.length) throw new Error('No account returned.')
      setWalletAddress(accounts[0])
      await ensureSelectedWalletNetwork(window.ethereum, network)
    } catch (err) {
      setPayError(getErrorMessage(err))
    } finally {
      setWalletBusy(false)
    }
  }

  const payWithBrowser = async () => {
    if (!walletAddress) {
      setPayError('Connect wallet first.')
      return
    }
    setPayLoading(true)
    setPayError('')
    setPaySummary('')
    try {
      await ensureSelectedWalletNetwork(window.ethereum!, network)
      const payload = judgePayload(network)
      const res = await liveX402Fetch(
        `/api/dance-extras/live/judge-score/${network}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        { walletAddress: walletAddress as `0x${string}`, network },
      )
      const { data, text } = await parseResponseJson(res)
      if (!res.ok) throw new Error(httpFailureMessage(res, text, data, 'Payment failed'))
      const receiptHeader = res.headers.get('payment-receipt') || ''
      const txHint = extractHexHash(receiptHeader)
      const rid =
        typeof (data as { receipt?: { externalId?: string } }).receipt?.externalId === 'string'
          ? (data as { receipt: { externalId: string } }).receipt.externalId
          : null
      setPaySummary(`Paid · ${rid ?? 'ok'} (${network})${txHint ? ` · ${txHint.slice(0, 14)}…` : ''}`)
    } catch (err) {
      setPayError(mapLivePayError(getErrorMessage(err)))
    } finally {
      setPayLoading(false)
    }
  }

  return (
    <div className="http-pay-browser-panel">
      <h3 className="http-pay-browser-panel__title">Try in browser (1-click)</h3>
      <div className="doc-prose-muted http-pay-browser-panel__lede">{lede}</div>
      <div className="http-pay-browser-panel__actions">
        <button type="button" className="secondary" disabled={wireLoading} onClick={runWireCheck}>
          {wireLoading ? 'Requesting…' : 'Run wire check (no wallet)'}
        </button>
        <button type="button" className="secondary" disabled={walletBusy} onClick={connectWallet}>
          {walletAddress ? `Wallet ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Connect wallet'}
        </button>
        <button type="button" disabled={payLoading || !walletAddress} onClick={payWithBrowser}>
          {payLoading ? 'Paying…' : 'Pay with wallet (x402)'}
        </button>
      </div>
      {payError ? <p className="http-pay-browser-panel__error">{payError}</p> : null}
      {paySummary ? <p className="http-pay-browser-panel__ok">{paySummary}</p> : null}
      {wireStatus ? (
        <div className="http-pay-browser-panel__out">
          <div className="http-pay-browser-panel__out-label">
            Wire check · <strong>{wireStatus}</strong>
            {wireStatus.startsWith('402') ? ' (expected without payment)' : null}
          </div>
          {wirePreview ? <pre className="http-pay-browser-panel__pre">{wirePreview}</pre> : null}
        </div>
      ) : null}
    </div>
  )
}
