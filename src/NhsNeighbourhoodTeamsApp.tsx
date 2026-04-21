import { useState } from 'react'
import NhsShell from './NhsShell'
import { apiPost } from './nhsApi'
import { getStoredPatientId } from './nhsSession'

export default function NhsNeighbourhoodTeamsApp() {
  const [patientId, setPatientId] = useState(getStoredPatientId())
  const [eventType, setEventType] = useState('mdt_case_review')
  const [detail, setDetail] = useState('MDT reviewed care plan and aligned social + clinical actions.')
  const [status, setStatus] = useState('Idle')

  return (
    <NhsShell title="Neighbourhood Team Coordination" subtitle="Record multidisciplinary team actions against a shared patient-centred plan.">
      {(session) => {
        const canWrite = session.role === 'gp' || session.role === 'nhc_provider'
        return (
        <section className="grid">
          <article className="card">
            <h2>Create coordination event</h2>
            <div className="actions">
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Patient ID" />
              <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="Event type" />
              <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={4} />
              <button
                disabled={!session.wallet || !canWrite}
                onClick={async () => {
                  const res = await apiPost<{ id: string }>(
                    '/api/nhs/neighbourhood-teams/coordinate',
                    session.role,
                    session.wallet,
                    { patientId, eventType, detail },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Create failed: ${res.error}`)
                    return
                  }
                  setStatus(`Event created: ${res.data.id}`)
                }}
              >
                Record event
              </button>
            </div>
            {!canWrite ? <p className="note">Requires role: gp or nhc_provider.</p> : null}
            <p>{status}</p>
          </article>
        </section>
      )}}
    </NhsShell>
  )
}

