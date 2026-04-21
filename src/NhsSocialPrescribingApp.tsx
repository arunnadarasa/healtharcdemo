import { useState } from 'react'
import NhsShell from './NhsShell'
import { apiGet, apiPost } from './nhsApi'
import { getStoredPatientId } from './nhsSession'

export default function NhsSocialPrescribingApp() {
  const [patientId, setPatientId] = useState(getStoredPatientId())
  const [reason, setReason] = useState('Loneliness and low mood affecting long-term condition self-management.')
  const [linkWorkerWallet, setLinkWorkerWallet] = useState('')
  const [referralId, setReferralId] = useState('')
  const [whatMatters, setWhatMatters] = useState('Build confidence, social connection, and routine physical activity.')
  const [interventions, setInterventions] = useState('Walking group\nCommunity gardening\nPeer support')
  const [status, setStatus] = useState('Idle')
  const [detail, setDetail] = useState<unknown>(null)

  return (
    <NhsShell title="Social Prescribing" subtitle="Refer patients to community support and maintain a link-worker support plan.">
      {(session) => {
        const canRefer = session.role === 'gp' || session.role === 'nhc_provider'
        return (
        <section className="grid">
          <article className="card">
            <h2>Create referral</h2>
            <div className="actions">
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Patient ID" />
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              <input
                value={linkWorkerWallet}
                onChange={(e) => setLinkWorkerWallet(e.target.value)}
                placeholder="Optional link worker wallet"
              />
              <button
                disabled={!session.wallet || !canRefer}
                onClick={async () => {
                  const res = await apiPost<{ id: string }>(
                    '/api/nhs/social-prescribing/referrals',
                    session.role,
                    session.wallet,
                    { patientId, reason, linkWorkerWallet },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Referral failed: ${res.error}`)
                    return
                  }
                  setReferralId(res.data.id)
                  setStatus(`Referral created: ${res.data.id}`)
                }}
              >
                Create referral
              </button>
            </div>
            {!canRefer ? <p className="note">Requires role: gp or nhc_provider.</p> : null}
          </article>
          <article className="card">
            <h2>Link-worker plan + fetch</h2>
            <div className="actions">
              <input value={referralId} onChange={(e) => setReferralId(e.target.value)} placeholder="Referral ID" />
              <textarea value={whatMatters} onChange={(e) => setWhatMatters(e.target.value)} rows={2} />
              <textarea value={interventions} onChange={(e) => setInterventions(e.target.value)} rows={3} />
              <button
                disabled={!session.wallet || !referralId || !canRefer}
                onClick={async () => {
                  const res = await apiPost<{ id: string }>(
                    '/api/nhs/social-prescribing/link-worker-plan',
                    session.role,
                    session.wallet,
                    {
                      referralId,
                      whatMatters,
                      interventions: interventions.split('\n').map((v) => v.trim()).filter(Boolean),
                    },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Plan update failed: ${res.error}`)
                    return
                  }
                  setStatus(`Support plan saved (${res.data.id})`)
                }}
              >
                Save support plan
              </button>
              <button
                disabled={!session.wallet || !referralId}
                onClick={async () => {
                  const res = await apiGet<unknown>(
                    `/api/nhs/social-prescribing/referrals/${encodeURIComponent(referralId)}`,
                    session.role,
                    session.wallet,
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Fetch failed: ${res.error}`)
                    return
                  }
                  setDetail(res.data)
                }}
              >
                Fetch referral
              </button>
            </div>
            {!canRefer ? <p className="note">Support plans require role: gp or nhc_provider.</p> : null}
            <p>{status}</p>
            <pre>{detail ? JSON.stringify(detail, null, 2) : 'No referral loaded.'}</pre>
          </article>
        </section>
      )}}
    </NhsShell>
  )
}

