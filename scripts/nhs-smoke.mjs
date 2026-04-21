/**
 * NHS smoke flow:
 * identity -> gp request -> care plan -> referral -> monitoring -> alert resolve
 *
 * Requires local API server running on localhost:8787.
 */
const BASE = process.env.NHS_SMOKE_BASE_URL || 'http://localhost:8787'
const wallet = process.env.NHS_SMOKE_WALLET || '0x610876de73cd9f8f925fd3f84903d25be6f0921d'
const headers = {
  'Content-Type': 'application/json',
  'x-wallet-address': wallet,
}

async function post(path, role, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...headers, 'x-user-role': role },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

async function get(path, role) {
  const res = await fetch(`${BASE}${path}`, { headers: { ...headers, 'x-user-role': role } })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`)
  return data
}

async function run() {
  const identity = await post('/api/nhs/identity/bootstrap', 'patient', {
    role: 'patient',
    fullName: 'Smoke Patient',
    dob: '1991-04-12',
  })
  const patientId = identity?.patient?.patientId
  if (!patientId) throw new Error('Missing patientId from identity bootstrap.')

  const gpRequest = await post('/api/nhs/gp-access/requests', 'patient', {
    requestText: 'Smoke test GP request',
    priority: 'routine',
    network: 'testnet',
  })

  const carePlan = await post('/api/nhs/care-plans', 'gp', {
    patientId,
    goal: 'Smoke test goal',
    actions: ['Action A', 'Action B'],
  })
  await post(`/api/nhs/care-plans/${carePlan.id}/updates`, 'gp', { note: 'Smoke update note' })

  const referral = await post('/api/nhs/social-prescribing/referrals', 'gp', {
    patientId,
    reason: 'Smoke social referral',
  })
  await post('/api/nhs/social-prescribing/link-worker-plan', 'nhc_provider', {
    referralId: referral.id,
    whatMatters: 'Smoke what matters',
    interventions: ['Walking group'],
  })

  const session = await post('/api/nhs/monitoring/sessions', 'gp', {
    patientId,
    metric: 'spo2',
    thresholdMin: 93,
    thresholdMax: 100,
  })
  const reading = await post('/api/nhs/monitoring/readings', 'patient', {
    sessionId: session.id,
    value: 90,
    source: 'smoke',
  })
  if (reading?.alert?.id) {
    await post(`/api/nhs/monitoring/alerts/${reading.alert.id}/resolve`, 'gp', { note: 'Resolved by smoke test' })
  }
  const timeline = await get(`/api/nhs/patients/${encodeURIComponent(patientId)}/timeline`, 'gp')
  console.log(JSON.stringify({ ok: true, patientId, gpRequestId: gpRequest.id, carePlanId: carePlan.id, referralId: referral.id, sessionId: session.id, timelineCount: timeline?.items?.length || 0 }, null, 2))
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

