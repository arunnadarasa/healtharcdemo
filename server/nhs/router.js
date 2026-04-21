import crypto from 'node:crypto'
import express from 'express'
import { appendAudit, all, get, insert, listPatientTimeline, run } from './db.js'
import { ensurePatientRecordForWallet, getActor, requireRoles, resolvePatientIdForActor } from './auth.js'
import { withArcGatewayGate } from './payment.js'

function nowIso() {
  return new Date().toISOString()
}

/** Echo x402 receipt reference in JSON when the gate returned one (headers alone can be dropped by proxies). */
function withReceipt(body, paymentCtx) {
  const ref = paymentCtx?.paymentReceiptRef
  if (ref != null && String(ref).length > 0) {
    return { ...body, receiptRef: ref }
  }
  return body
}

export function createNhsRouter(deps) {
  const router = express.Router()
  const gate = (config, handler) => withArcGatewayGate(deps, config, handler)
  const paymentGateEnabled = process.env.NHS_ENABLE_PAYMENT_GATE === 'true'

  router.post('/identity/bootstrap', (req, res) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const patient = actor.role === 'patient' ? ensurePatientRecordForWallet(actor, req.body ?? {}) : null
    return res.status(201).json({ ok: true, actor, patient })
  })

  router.post(
    '/gp-access/requests',
    ...gate({ enabled: paymentGateEnabled, amount: '0.02', description: 'NHS GP access request', externalIdPrefix: 'nhs_gp' }, (req, res, paymentCtx) => {
      const actor = getActor(req)
      if (actor.error) return res.status(400).json({ error: actor.error })
      const forbidden = requireRoles(actor, ['patient'])
      if (forbidden) return res.status(403).json({ error: forbidden })
      const patient = ensurePatientRecordForWallet(actor, req.body ?? {})
      const requestText = req.body?.requestText
      const priority = req.body?.priority === 'high' ? 'high' : 'routine'
      if (typeof requestText !== 'string' || !requestText.trim()) {
        return res.status(400).json({ error: 'requestText is required.' })
      }
      const id = `gpr_${crypto.randomUUID()}`
      const now = nowIso()
      insert('gp_access_requests', {
        id,
        patient_id: patient.patientId,
        request_text: requestText.trim(),
        priority,
        status: 'submitted',
        assigned_gp_wallet: null,
        receipt_ref: paymentCtx.paymentReceiptRef ?? null,
        created_at: now,
        updated_at: now,
      })
      appendAudit({
        actorWallet: actor.walletAddress,
        actorRole: actor.role,
        action: 'gp_access_request_created',
        entityType: 'gp_access_request',
        entityId: id,
        payload: { priority },
        paymentReceiptRef: paymentCtx.paymentReceiptRef,
      })
      return res.status(201).json(withReceipt({ id, patientId: patient.patientId, status: 'submitted', priority }, paymentCtx))
    }),
  )

  router.get('/gp-access/requests/:id', (req, res) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const row = get(
      `SELECT id, patient_id AS patientId, request_text AS requestText, priority, status, assigned_gp_wallet AS assignedGpWallet, receipt_ref AS receiptRef, created_at AS createdAt, updated_at AS updatedAt FROM gp_access_requests WHERE id = ?`,
      [req.params.id],
    )
    if (!row) return res.status(404).json({ error: 'Request not found.' })
    if (actor.role === 'patient') {
      const patientId = resolvePatientIdForActor(actor)
      if (!patientId || patientId !== row.patientId) return res.status(403).json({ error: 'Forbidden.' })
    }
    return res.json(row)
  })

  router.post('/care-plans', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.02',
    description: 'NHS care plan write',
    externalIdPrefix: 'nhs_care_plan',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['gp', 'nhc_provider'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const { patientId, goal, actions } = req.body ?? {}
    if (typeof patientId !== 'string' || typeof goal !== 'string' || !Array.isArray(actions)) {
      return res.status(400).json({ error: 'Expected patientId, goal, and actions[]' })
    }
    const id = `cp_${crypto.randomUUID()}`
    const now = nowIso()
    insert('care_plans', {
      id,
      patient_id: patientId,
      goal: goal.trim(),
      actions_json: JSON.stringify(actions),
      owner_wallet: actor.walletAddress,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'care_plan_created',
      entityType: 'care_plan',
      entityId: id,
      payload: { patientId, goal },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.status(201).json(withReceipt({ id, patientId, goal, actions, status: 'active' }, paymentCtx))
  }))

  router.get('/care-plans/:patientId', (req, res) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const patientId =
      actor.role === 'patient' ? resolvePatientIdForActor(actor) : req.params.patientId
    if (!patientId) return res.status(403).json({ error: 'Forbidden.' })
    if (actor.role === 'patient' && patientId !== req.params.patientId) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    const plans = all(
      `SELECT id, patient_id AS patientId, goal, actions_json AS actionsJson, owner_wallet AS ownerWallet, status, created_at AS createdAt, updated_at AS updatedAt FROM care_plans WHERE patient_id = ? ORDER BY updated_at DESC`,
      [patientId],
    ).map((p) => ({ ...p, actions: JSON.parse(p.actionsJson || '[]') }))
    return res.json({ items: plans })
  })

  router.post('/care-plans/:planId/updates', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.01',
    description: 'NHS care plan update',
    externalIdPrefix: 'nhs_care_plan_update',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['gp', 'nhc_provider'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const note = req.body?.note
    if (typeof note !== 'string' || !note.trim()) return res.status(400).json({ error: 'note is required.' })
    const id = `cpu_${crypto.randomUUID()}`
    const now = nowIso()
    insert('care_plan_updates', {
      id,
      plan_id: req.params.planId,
      note: note.trim(),
      updated_by_wallet: actor.walletAddress,
      created_at: now,
    })
    run('UPDATE care_plans SET updated_at = ? WHERE id = ?', [now, req.params.planId])
    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'care_plan_updated',
      entityType: 'care_plan_update',
      entityId: id,
      payload: { planId: req.params.planId },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.status(201).json(withReceipt({ id, planId: req.params.planId, note: note.trim() }, paymentCtx))
  }))

  router.post('/social-prescribing/referrals', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.02',
    description: 'NHS social prescribing referral',
    externalIdPrefix: 'nhs_social_referral',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['gp', 'nhc_provider'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const { patientId, reason, linkWorkerWallet } = req.body ?? {}
    if (typeof patientId !== 'string' || typeof reason !== 'string') {
      return res.status(400).json({ error: 'Expected patientId and reason.' })
    }
    const id = `spr_${crypto.randomUUID()}`
    const now = nowIso()
    insert('social_prescribing_referrals', {
      id,
      patient_id: patientId,
      referred_by_wallet: actor.walletAddress,
      reason: reason.trim(),
      link_worker_wallet: typeof linkWorkerWallet === 'string' ? linkWorkerWallet.toLowerCase() : null,
      status: 'referred',
      created_at: now,
      updated_at: now,
    })
    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'social_referral_created',
      entityType: 'social_referral',
      entityId: id,
      payload: { patientId, reason },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.status(201).json(withReceipt({ id, patientId, status: 'referred' }, paymentCtx))
  }))

  router.get('/social-prescribing/referrals/:id', (req, res) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const row = get(
      'SELECT id, patient_id AS patientId, referred_by_wallet AS referredByWallet, reason, link_worker_wallet AS linkWorkerWallet, status, created_at AS createdAt, updated_at AS updatedAt FROM social_prescribing_referrals WHERE id = ?',
      [req.params.id],
    )
    if (!row) return res.status(404).json({ error: 'Referral not found.' })
    if (actor.role === 'patient') {
      const patientId = resolvePatientIdForActor(actor)
      if (!patientId || patientId !== row.patientId) return res.status(403).json({ error: 'Forbidden.' })
    }
    return res.json(row)
  })

  router.post('/social-prescribing/link-worker-plan', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.01',
    description: 'NHS link worker plan write',
    externalIdPrefix: 'nhs_link_worker_plan',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['nhc_provider', 'gp'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const { referralId, whatMatters, interventions } = req.body ?? {}
    if (typeof referralId !== 'string' || typeof whatMatters !== 'string' || !Array.isArray(interventions)) {
      return res.status(400).json({ error: 'Expected referralId, whatMatters, interventions[]' })
    }
    const existing = get('SELECT id FROM social_link_worker_plans WHERE referral_id = ?', [referralId])
    const now = nowIso()
    if (existing) {
      run(
        'UPDATE social_link_worker_plans SET what_matters = ?, interventions_json = ?, updated_by_wallet = ?, updated_at = ? WHERE referral_id = ?',
        [whatMatters.trim(), JSON.stringify(interventions), actor.walletAddress, now, referralId],
      )
      run('UPDATE social_prescribing_referrals SET status = ?, updated_at = ? WHERE id = ?', ['in_support_plan', now, referralId])
      appendAudit({
        actorWallet: actor.walletAddress,
        actorRole: actor.role,
        action: 'social_link_plan_updated',
        entityType: 'social_link_plan',
        entityId: existing.id,
        payload: { referralId },
        paymentReceiptRef: paymentCtx.paymentReceiptRef,
      })
      return res.json(withReceipt({ id: existing.id, referralId, whatMatters, interventions }, paymentCtx))
    }

    const id = `slp_${crypto.randomUUID()}`
    insert('social_link_worker_plans', {
      id,
      referral_id: referralId,
      what_matters: whatMatters.trim(),
      interventions_json: JSON.stringify(interventions),
      updated_by_wallet: actor.walletAddress,
      created_at: now,
      updated_at: now,
    })
    run('UPDATE social_prescribing_referrals SET status = ?, updated_at = ? WHERE id = ?', ['in_support_plan', now, referralId])
    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'social_link_plan_created',
      entityType: 'social_link_plan',
      entityId: id,
      payload: { referralId },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.status(201).json(withReceipt({ id, referralId, whatMatters, interventions }, paymentCtx))
  }))

  router.post('/neighbourhood-teams/coordinate', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.01',
    description: 'NHS neighbourhood coordination write',
    externalIdPrefix: 'nhs_neighbourhood_coord',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['gp', 'nhc_provider'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const { patientId, eventType, detail } = req.body ?? {}
    if (typeof patientId !== 'string' || typeof eventType !== 'string' || typeof detail !== 'string') {
      return res.status(400).json({ error: 'Expected patientId, eventType, and detail.' })
    }
    const id = `nhe_${crypto.randomUUID()}`
    insert('neighbourhood_team_events', {
      id,
      patient_id: patientId,
      event_type: eventType.trim(),
      detail: detail.trim(),
      created_by_wallet: actor.walletAddress,
      created_at: nowIso(),
    })
    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'neighbourhood_coordination_event',
      entityType: 'neighbourhood_event',
      entityId: id,
      payload: { patientId, eventType },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.status(201).json(withReceipt({ id, patientId, eventType, detail }, paymentCtx))
  }))

  router.post('/monitoring/sessions', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.02',
    description: 'NHS monitoring session create',
    externalIdPrefix: 'nhs_monitoring_session',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['gp', 'nhc_provider'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const { patientId, metric, thresholdMin, thresholdMax } = req.body ?? {}
    if (typeof patientId !== 'string' || typeof metric !== 'string') {
      return res.status(400).json({ error: 'Expected patientId and metric.' })
    }
    const id = `ms_${crypto.randomUUID()}`
    const now = nowIso()
    insert('monitoring_sessions', {
      id,
      patient_id: patientId,
      metric: metric.trim(),
      threshold_min: Number.isFinite(Number(thresholdMin)) ? Number(thresholdMin) : null,
      threshold_max: Number.isFinite(Number(thresholdMax)) ? Number(thresholdMax) : null,
      created_by_wallet: actor.walletAddress,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'monitoring_session_created',
      entityType: 'monitoring_session',
      entityId: id,
      payload: { patientId, metric },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.status(201).json(withReceipt({ id, patientId, metric, status: 'active' }, paymentCtx))
  }))

  router.post('/monitoring/readings', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.01',
    description: 'NHS monitoring reading write',
    externalIdPrefix: 'nhs_monitoring_reading',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const { sessionId, value, source } = req.body ?? {}
    if (typeof sessionId !== 'string' || !Number.isFinite(Number(value))) {
      return res.status(400).json({ error: 'Expected sessionId and numeric value.' })
    }
    const session = get(
      'SELECT id, patient_id AS patientId, metric, threshold_min AS thresholdMin, threshold_max AS thresholdMax FROM monitoring_sessions WHERE id = ?',
      [sessionId],
    )
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (actor.role === 'patient') {
      const patientId = resolvePatientIdForActor(actor)
      if (!patientId || patientId !== session.patientId) return res.status(403).json({ error: 'Forbidden.' })
    }
    const readingId = `mr_${crypto.randomUUID()}`
    const readingValue = Number(value)
    const now = nowIso()
    insert('monitoring_readings', {
      id: readingId,
      session_id: sessionId,
      patient_id: session.patientId,
      value: readingValue,
      recorded_at: now,
      source: typeof source === 'string' && source.trim() ? source.trim() : 'manual',
      created_at: now,
    })

    let alert = null
    const overMax = Number.isFinite(session.thresholdMax) && readingValue > session.thresholdMax
    const underMin = Number.isFinite(session.thresholdMin) && readingValue < session.thresholdMin
    if (overMax || underMin) {
      const alertId = `ma_${crypto.randomUUID()}`
      const reason = overMax ? `Above threshold (${session.thresholdMax})` : `Below threshold (${session.thresholdMin})`
      insert('monitoring_alerts', {
        id: alertId,
        session_id: sessionId,
        patient_id: session.patientId,
        reading_id: readingId,
        status: 'open',
        reason,
        created_at: now,
        resolved_at: null,
        resolved_by_wallet: null,
      })
      alert = { id: alertId, reason, status: 'open' }
    }

    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'monitoring_reading_recorded',
      entityType: 'monitoring_reading',
      entityId: readingId,
      payload: { sessionId, value: readingValue, alert: alert?.id || null },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.status(201).json(withReceipt({ id: readingId, sessionId, value: readingValue, alert }, paymentCtx))
  }))

  router.post('/monitoring/alerts/:alertId/resolve', ...gate({
    enabled: paymentGateEnabled,
    amount: '0.01',
    description: 'NHS monitoring alert resolve',
    externalIdPrefix: 'nhs_monitoring_alert_resolve',
  }, (req, res, paymentCtx) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['gp', 'nhc_provider'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const alert = get('SELECT id, status FROM monitoring_alerts WHERE id = ?', [req.params.alertId])
    if (!alert) return res.status(404).json({ error: 'Alert not found.' })
    if (alert.status === 'resolved') return res.json(withReceipt({ id: alert.id, status: 'resolved' }, paymentCtx))
    const now = nowIso()
    run('UPDATE monitoring_alerts SET status = ?, resolved_at = ?, resolved_by_wallet = ? WHERE id = ?', [
      'resolved',
      now,
      actor.walletAddress,
      alert.id,
    ])
    appendAudit({
      actorWallet: actor.walletAddress,
      actorRole: actor.role,
      action: 'monitoring_alert_resolved',
      entityType: 'monitoring_alert',
      entityId: alert.id,
      payload: { note: req.body?.note || null },
      paymentReceiptRef: paymentCtx.paymentReceiptRef,
    })
    return res.json(withReceipt({ id: alert.id, status: 'resolved', resolvedAt: now }, paymentCtx))
  }))

  router.get('/patients/:patientId/timeline', (req, res) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    if (actor.role === 'patient') {
      const patientId = resolvePatientIdForActor(actor)
      if (!patientId || patientId !== req.params.patientId) return res.status(403).json({ error: 'Forbidden.' })
    }
    return res.json({ items: listPatientTimeline(req.params.patientId) })
  })

  router.get('/audit', (req, res) => {
    const actor = getActor(req)
    if (actor.error) return res.status(400).json({ error: actor.error })
    const forbidden = requireRoles(actor, ['gp', 'nhc_provider'])
    if (forbidden) return res.status(403).json({ error: forbidden })
    const items = all(
      `SELECT id, actor_wallet AS actorWallet, actor_role AS actorRole, action, entity_type AS entityType, entity_id AS entityId, payment_receipt_ref AS paymentReceiptRef, created_at AS createdAt, payload_json AS payloadJson
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT 200`,
    ).map((row) => ({ ...row, payload: JSON.parse(row.payloadJson || '{}') }))
    return res.json({ items })
  })

  return router
}

