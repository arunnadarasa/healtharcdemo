import { useState } from 'react'
import NhsShell from './NhsShell'
import { apiGet, apiPost } from './nhsApi'

type GpCreateResponse = { id: string; status: string; priority: string }
type GpGetResponse = {
  id: string
  patientId: string
  requestText: string
  priority: string
  status: string
  createdAt: string
}

export default function NhsGpAccessApp() {
  const [requestText, setRequestText] = useState('Shortness of breath and persistent cough for 3 days.')
  const [priority, setPriority] = useState<'routine' | 'high'>('routine')
  const [requestId, setRequestId] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('requestId') ?? ''
  })
  const [status, setStatus] = useState('Idle')
  const [lookup, setLookup] = useState<GpGetResponse | null>(null)
  const [txUrl, setTxUrl] = useState<string | null>(null)

  return (
    <NhsShell title="GP Access Front Door" subtitle="Create and track same-day GP access requests with wallet-authenticated patient identity.">
      {(session) => {
        const canCreate = session.role === 'patient'
        return (
        <section className="grid">
          <article className="card">
            <h2>Create GP access request</h2>
            <div className="actions">
              <textarea value={requestText} onChange={(e) => setRequestText(e.target.value)} rows={4} />
              <select value={priority} onChange={(e) => setPriority(e.target.value === 'high' ? 'high' : 'routine')}>
                <option value="routine">routine</option>
                <option value="high">high</option>
              </select>
              <button
                disabled={!session.wallet || !canCreate}
                onClick={async () => {
                  const res = await apiPost<GpCreateResponse>('/api/nhs/gp-access/requests', session.role, session.wallet, {
                    requestText,
                    priority,
                  }, { network: session.network })
                  if (!res.ok) {
                    setStatus(`Create failed: ${res.error}`)
                    return
                  }
                  setRequestId(res.data.id)
                  setStatus(`Created ${res.data.id} (${res.data.status})`)
                  setTxUrl(res.explorerUrl)
                }}
              >
                Submit request
              </button>
            </div>
            {!canCreate ? <p className="note">Create request is for role: patient.</p> : null}
            <p>Status: {status}</p>
            {txUrl ? (
              <p className="intent">
                Transaction: <a href={txUrl} target="_blank" rel="noreferrer">View on Arc explorer</a>
              </p>
            ) : null}
          </article>
          <article className="card">
            <h2>Get request</h2>
            <div className="actions">
              <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" />
              <button
                disabled={!session.wallet || !requestId}
                onClick={async () => {
                  const res = await apiGet<GpGetResponse>(
                    `/api/nhs/gp-access/requests/${encodeURIComponent(requestId)}`,
                    session.role,
                    session.wallet,
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Lookup failed: ${res.error}`)
                    return
                  }
                  setLookup(res.data)
                }}
              >
                Fetch
              </button>
            </div>
            <pre>{lookup ? JSON.stringify(lookup, null, 2) : 'No lookup result yet.'}</pre>
          </article>
        </section>
      )}}
    </NhsShell>
  )
}

