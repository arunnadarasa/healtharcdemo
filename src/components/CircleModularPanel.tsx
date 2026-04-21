import { useState } from 'react'
import {
  DEFAULT_CIRCLE_MODULAR_CLIENT_URL,
  getCircleModularConfig,
  isCircleModularMock,
  pingCircleModularRpc,
  resolveModularClientUrl,
} from '../circleModular'

export function CircleModularPanel() {
  const cfg = getCircleModularConfig()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const test = async () => {
    if (!cfg) {
      setStatus('Add VITE_CIRCLE_CLIENT_KEY to .env and restart Vite.')
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const { chainId, blockNumber } = await pingCircleModularRpc()
      setStatus(
        `${isCircleModularMock() ? '[Mock] ' : ''}Connected. chainId=${chainId}${
          blockNumber !== undefined ? `, block=${blockNumber.toString()}` : ''
        }`,
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Circle Modular Wallets</h2>
      <p className="note">
        Live JSON-RPC to <code>{DEFAULT_CIRCLE_MODULAR_CLIENT_URL}</code> often fails locally: browser-direct hits{' '}
        <strong>CORS</strong>, and the same-origin proxy uses <strong>Node</strong> which <strong>Cloudflare blocks</strong>{' '}
        (HTTP 403 Lockout). That is upstream — not your Arc or x402 setup. For a working green check, set{' '}
        <code>VITE_CIRCLE_MODULAR_MOCK=1</code> (demo only). <code>VITE_CIRCLE_CLIENT_KEY</code> still comes from Circle
        Console (Web, Allowed Domain <code>localhost</code>).
      </p>
      {isCircleModularMock() ? (
        <p className="intent">
          <strong>Mock mode on</strong> — chainId is simulated (Arc testnet 5042002).
        </p>
      ) : null}
      <p className="note">
        LLM docs:{' '}
        <a href="https://developers.circle.com/llms-full.txt" target="_blank" rel="noreferrer">
          developers.circle.com/llms-full.txt
        </a>
        {' · '}
        <a href="https://docs.arc.network/llms-full.txt" target="_blank" rel="noreferrer">
          docs.arc.network/llms-full.txt
        </a>
      </p>
      {cfg ? (
        <p className="note">
          Resolved client URL: <code>{resolveModularClientUrl()}</code>
        </p>
      ) : null}
      <p className="intent">
        Status: <strong>{cfg ? 'VITE_CIRCLE_CLIENT_KEY is set' : 'Missing VITE_CIRCLE_CLIENT_KEY'}</strong>
      </p>
      <div className="actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void test()}>
          {busy ? 'Testing…' : isCircleModularMock() ? 'Test Modular API (mock)' : 'Test Modular API (chainId)'}
        </button>
      </div>
      {status ? (
        <pre className="log" role="status" style={{ marginTop: '0.75rem' }}>
          {status}
        </pre>
      ) : null}
    </section>
  )
}
