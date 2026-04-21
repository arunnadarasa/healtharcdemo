import { useState } from 'react'
import NhsShell from './NhsShell'
import { apiGet, apiPost } from './nhsApi'
import { getStoredPatientId } from './nhsSession'

type CarePlanCreate = { id: string; patientId: string; goal: string; status: string }
type CarePlanList = { items: Array<{ id: string; goal: string; status: string; actions: string[] }> }

export default function NhsCarePlansApp() {
  const [patientId, setPatientId] = useState(getStoredPatientId())
  const [goal, setGoal] = useState('Improve asthma control and reduce urgent exacerbations.')
  const [actionsText, setActionsText] = useState('Daily inhaler check-in\nWeekly breathing exercise\nReview at 4 weeks')
  const [planId, setPlanId] = useState('')
  const [updateNote, setUpdateNote] = useState('Patient adherence improved; continue current regimen.')
  const [status, setStatus] = useState('Idle')
  const [plans, setPlans] = useState<CarePlanList['items']>([])

  return (
    <NhsShell title="Personalised Care Plans" subtitle="Author and maintain personalised plans shared by GP and neighbourhood teams.">
      {(session) => {
        const canWrite = session.role === 'gp' || session.role === 'nhc_provider'
        return (
        <section className="grid">
          <article className="card">
            <h2>Create care plan</h2>
            <div className="actions">
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Patient ID" />
              <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal" />
              <textarea value={actionsText} onChange={(e) => setActionsText(e.target.value)} rows={4} />
              <button
                disabled={!session.wallet || !canWrite}
                onClick={async () => {
                  const actions = actionsText.split('\n').map((v) => v.trim()).filter(Boolean)
                  const res = await apiPost<CarePlanCreate>(
                    '/api/nhs/care-plans',
                    session.role,
                    session.wallet,
                    { patientId, goal, actions },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Create failed: ${res.error}`)
                    return
                  }
                  setPlanId(res.data.id)
                  setStatus(`Created plan ${res.data.id}`)
                }}
              >
                Create plan
              </button>
            </div>
            {!canWrite ? <p className="note">Requires role: gp or nhc_provider.</p> : null}
            <p>{status}</p>
          </article>

          <article className="card">
            <h2>Update + list plans</h2>
            <div className="actions">
              <input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="Plan ID" />
              <input value={updateNote} onChange={(e) => setUpdateNote(e.target.value)} placeholder="Update note" />
              <button
                disabled={!session.wallet || !planId || !canWrite}
                onClick={async () => {
                  const res = await apiPost<{ id: string }>(
                    `/api/nhs/care-plans/${encodeURIComponent(planId)}/updates`,
                    session.role,
                    session.wallet,
                    { note: updateNote },
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`Update failed: ${res.error}`)
                    return
                  }
                  setStatus(`Added update ${res.data.id}`)
                }}
              >
                Add update
              </button>
              <button
                disabled={!session.wallet || !patientId}
                onClick={async () => {
                  const res = await apiGet<CarePlanList>(
                    `/api/nhs/care-plans/${encodeURIComponent(patientId)}`,
                    session.role,
                    session.wallet,
                    { network: session.network },
                  )
                  if (!res.ok) {
                    setStatus(`List failed: ${res.error}`)
                    return
                  }
                  setPlans(res.data.items)
                }}
              >
                Refresh list
              </button>
            </div>
            {!canWrite ? <p className="note">Updates require role: gp or nhc_provider.</p> : null}
            <pre>{JSON.stringify(plans, null, 2)}</pre>
          </article>
        </section>
      )}}
    </NhsShell>
  )
}

