import { useState } from 'react'
import NhsShell from './NhsShell'
import { apiGet, apiPost } from './nhsApi'
import { getStoredPatientId } from './nhsSession'

type SessionCreate = { id: string; patientId: string; metric: string; status: string }
type ReadingCreate = { id: string; alert: { id: string; reason: string } | null }

export default function NhsMonitoringApp() {
  const [patientId, setPatientId] = useState(getStoredPatientId())
  const [metric, setMetric] = useState('oxygen_saturation')
  const [thresholdMin, setThresholdMin] = useState('93')
  const [thresholdMax, setThresholdMax] = useState('100')
  const [sessionId, setSessionId] = useState('')
  const [value, setValue] = useState('91')
  const [alertId, setAlertId] = useState('')
  const [status, setStatus] = useState('Idle')
  const [timeline, setTimeline] = useState<unknown>(null)

  return (
    <NhsShell title="Remote Monitoring" subtitle="Track deterioration risk and trigger proactive outreach alerts for neighbourhood teams.">
      {(session) => {
        const canClinicianWrite = session.role === 'gp' || session.role === 'nhc_provider'
        return (
        <section className="grid">
          <article className="card">
            <h2>Monitoring session + reading</h2>
            <div className="actions">
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Patient ID" />
              <input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="Metric" />
              <input value={thresholdMin} onChange={(e) => setThresholdMin(e.target.value)} placeholder="Threshold min" />
              <input value={thresholdMax} onChange={(e) => setThresholdMax(e.target.value)} placeholder="Threshold max" />
              <button
                disabled={!session.wallet || !canClinicianWrite}
                onClick={async () => {
                  const res = await apiPost<SessionCreate>(
                    '/api/nhs/monitoring/sessions',
                    session.role,
                    session.wallet,
                    { patientId, metric, thresholdMin: Number(thresholdMin), thresholdMax: Number(thresholdMax) },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Session failed: ${res.error}`)
                    return
                  }
                  setSessionId(res.data.id)
                  setStatus(`Session created: ${res.data.id}`)
                }}
              >
                Create session
              </button>
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Reading value" />
              <button
                disabled={!session.wallet || !sessionId}
                onClick={async () => {
                  const res = await apiPost<ReadingCreate>(
                    '/api/nhs/monitoring/readings',
                    session.role,
                    session.wallet,
                    { sessionId, value: Number(value), source: 'home_device' },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Reading failed: ${res.error}`)
                    return
                  }
                  if (res.data.alert?.id) {
                    setAlertId(res.data.alert.id)
                    setStatus(`Reading recorded with alert ${res.data.alert.id}`)
                  } else {
                    setStatus('Reading recorded; no alert.')
                  }
                }}
              >
                Record reading
              </button>
            </div>
            {!canClinicianWrite ? <p className="note">Session creation requires role: gp or nhc_provider.</p> : null}
          </article>
          <article className="card">
            <h2>Resolve alert + patient timeline</h2>
            <div className="actions">
              <input value={alertId} onChange={(e) => setAlertId(e.target.value)} placeholder="Alert ID" />
              <button
                disabled={!session.wallet || !alertId || !canClinicianWrite}
                onClick={async () => {
                  const res = await apiPost<{ status: string }>(
                    `/api/nhs/monitoring/alerts/${encodeURIComponent(alertId)}/resolve`,
                    session.role,
                    session.wallet,
                    { note: 'Follow-up completed' },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Resolve failed: ${res.error}`)
                    return
                  }
                  setStatus(`Alert ${alertId} ${res.data.status}`)
                }}
              >
                Resolve alert
              </button>
              <button
                disabled={!session.wallet || !patientId}
                onClick={async () => {
                  const res = await apiGet<unknown>(
                    `/api/nhs/patients/${encodeURIComponent(patientId)}/timeline`,
                    session.role,
                    session.wallet,
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Timeline failed: ${res.error}`)
                    return
                  }
                  setTimeline(res.data)
                }}
              >
                Load timeline
              </button>
            </div>
            {!canClinicianWrite ? <p className="note">Alert resolution requires role: gp or nhc_provider.</p> : null}
            <p>{status}</p>
            <pre>{timeline ? JSON.stringify(timeline, null, 2) : 'No timeline loaded.'}</pre>
          </article>
        </section>
      )}}
    </NhsShell>
  )
}

