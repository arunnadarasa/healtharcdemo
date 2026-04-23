import express from 'express'
import { randomUUID } from 'node:crypto'
import { ethers } from 'ethers'
import { withArcGatewayGate } from '../nhs/payment.js'
import { parseTokenPolicyFromPayload, verifyTokenPolicyAccess } from './licenseContractAuth.js'

const PINATA_API_BASE = 'https://api.pinata.cloud'
const PINATA_GATEWAY_BASE = 'https://gateway.pinata.cloud/ipfs'
const ARC_TESTNET_RPC_DEFAULT = 'https://rpc.testnet.arc.network'
const LICENSE_ISSUER_ABI = [
  {
    type: 'function',
    name: 'issueLicense',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'holder', type: 'address' },
      { name: 'scope', type: 'bytes32' },
      { name: 'expiresAt', type: 'uint64' },
    ],
    outputs: [{ name: 'licenseId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'LicenseIssued',
    inputs: [
      { indexed: true, name: 'licenseId', type: 'uint256' },
      { indexed: true, name: 'holder', type: 'address' },
      { indexed: true, name: 'scope', type: 'bytes32' },
      { indexed: false, name: 'expiresAt', type: 'uint64' },
    ],
  },
]

function resolveArcRpcUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ARC_TESTNET_RPC_DEFAULT
  try {
    const url = new URL(value)
    if (url.hostname === 'rpc-testnet.arcscan.app') return ARC_TESTNET_RPC_DEFAULT
    return value
  } catch {
    return value
  }
}

function nowIso() {
  return new Date().toISOString()
}

/** @typedef {'allowlist' | 'owner' | 'token' | 'open'} PolicyMode */

/**
 * In-memory CDR demo store. Purposefully deterministic + synthetic for hackathon MVP.
 * Replace with Story/CDR SDK integration in production.
 */
const vaultStore = new Map()
const auditEvents = []

async function uploadFileToPinata({ fileName, mimeType, fileBuffer }) {
  const jwt = String(process.env.PINATA_JWT || '').trim()
  if (!jwt) {
    return { ok: false, error: 'PINATA_JWT is not configured on the API server.' }
  }
  const form = new FormData()
  form.append('file', new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' }), fileName)
  form.append(
    'pinataMetadata',
    JSON.stringify({
      name: fileName,
      keyvalues: { source: 'clinical-arc-cdr' },
    }),
  )

  const resp = await fetch(`${PINATA_API_BASE}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  })
  const payload = await resp.json().catch(() => null)
  if (!resp.ok) {
    const details =
      payload && typeof payload === 'object' && typeof payload.error === 'string' ? payload.error : `HTTP ${resp.status}`
    return { ok: false, error: `Pinata upload failed: ${details}` }
  }
  const hash = payload && typeof payload === 'object' ? payload.IpfsHash : null
  if (typeof hash !== 'string' || !hash) {
    return { ok: false, error: 'Pinata upload failed: missing IpfsHash in response.' }
  }
  return {
    ok: true,
    cid: hash,
    ipfsUri: `ipfs://${hash}`,
    gatewayUrl: `${PINATA_GATEWAY_BASE}/${hash}`,
    pinataResponse: payload,
  }
}

async function uploadJsonToPinata({ body }) {
  const jwt = String(process.env.PINATA_JWT || '').trim()
  if (!jwt) {
    return { ok: false, error: 'PINATA_JWT is not configured on the API server.' }
  }
  const resp = await fetch(`${PINATA_API_BASE}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await resp.json().catch(() => null)
  if (!resp.ok) {
    const details =
      payload && typeof payload === 'object' && typeof payload.error === 'string' ? payload.error : `HTTP ${resp.status}`
    return { ok: false, error: `Pinata metadata upload failed: ${details}` }
  }
  const hash = payload && typeof payload === 'object' ? payload.IpfsHash : null
  if (typeof hash !== 'string' || !hash) {
    return { ok: false, error: 'Pinata metadata upload failed: missing IpfsHash in response.' }
  }
  return { ok: true, cid: hash, ipfsUri: `ipfs://${hash}`, gatewayUrl: `${PINATA_GATEWAY_BASE}/${hash}` }
}

function pushAudit(event) {
  const withId = {
    eventId: `cdr_evt_${randomUUID()}`,
    createdAt: nowIso(),
    demoOnly: true,
    ...event,
  }
  auditEvents.unshift(withId)
  if (auditEvents.length > 600) auditEvents.length = 600
  return withId
}

function makeVaultSnapshot(vault) {
  return {
    vaultId: vault.vaultId,
    createdAt: vault.createdAt,
    policyMode: vault.policyMode,
    policyType: vault.policyType,
    conditionRef: vault.conditionRef,
    tokenPolicy: vault.tokenPolicy || null,
    ownerWallet: vault.ownerWallet,
    status: vault.status,
    purpose: vault.purpose,
    assetCount: vault.assets.length,
    latestAsset: vault.assets[0] || null,
    pendingRequests: vault.requests.filter((r) => r.status === 'requested').length,
    recoveredCount: vault.requests.filter((r) => r.status === 'recovered').length,
    revokedAt: vault.revokedAt || null,
    disclaimer: 'Synthetic/demo only. Not clinical advice.',
  }
}

/**
 * @param {{ gateway: import('@circle-fin/x402-batching/server').GatewayMiddleware, skipInternalGateway?: boolean|((req:any)=>boolean) }} deps
 */
export function createCdrRouter(deps) {
  const router = express.Router()
  const gate = (config, handler) => withArcGatewayGate(deps, config, handler)
  const paymentGateEnabled = process.env.NHS_ENABLE_PAYMENT_GATE !== 'false'

  router.post('/licenses/check', async (req, res) => {
    const holder = String(req.body?.holder || req.get('x-user-wallet') || '').trim().toLowerCase()
    const parsed = parseTokenPolicyFromPayload({
      tokenPolicy: {
        contractAddress: req.body?.contractAddress,
        licenseId: req.body?.licenseId,
        requiredScope: req.body?.requiredScope,
      },
    })
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error })
    const result = await verifyTokenPolicyAccess({
      tokenPolicy: parsed.tokenPolicy,
      requesterWallet: holder,
    })
    if (!result.ok) {
      return res.status(503).json({
        ok: false,
        authorizationStatus: result.authorizationStatus,
        reason: result.reason,
        error: result.error || 'Authorization check failed.',
      })
    }
    return res.status(200).json({
      ok: true,
      holder,
      contractAddress: parsed.tokenPolicy.contractAddress,
      licenseId: parsed.tokenPolicy.licenseId,
      requiredScope: parsed.tokenPolicy.requiredScope,
      allowed: result.allowed,
      reason: result.reason,
      authorizationStatus: result.authorizationStatus,
      rawCode: result.rawCode,
    })
  })

  router.post('/licenses/issue', async (req, res) => {
    const holder = String(req.body?.holder || req.get('x-user-wallet') || '').trim().toLowerCase()
    const contractAddress = String(req.body?.contractAddress || process.env.LICENSE_CONDITION_ADDRESS || '').trim()
    const scopeRaw = String(req.body?.scope || 'NIHR_APPROVED').trim() || 'NIHR_APPROVED'
    const expiresInDaysRaw = Number.parseInt(String(req.body?.expiresInDays ?? '30'), 10)
    const expiresInDays = Number.isFinite(expiresInDaysRaw) ? Math.max(1, Math.min(expiresInDaysRaw, 3650)) : 30
    const deployerPrivateKey = String(process.env.DEPLOYER_PRIVATE_KEY || '').trim()
    if (!deployerPrivateKey) {
      return res.status(503).json({ ok: false, error: 'DEPLOYER_PRIVATE_KEY is not configured on the server.' })
    }
    if (!ethers.isAddress(holder)) return res.status(400).json({ ok: false, error: 'Valid holder wallet is required.' })
    if (!ethers.isAddress(contractAddress)) {
      return res.status(400).json({ ok: false, error: 'Valid contractAddress is required.' })
    }
    try {
      const rpcUrl = resolveArcRpcUrl(process.env.ARC_RPC_URL || '')
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      const pk = deployerPrivateKey.startsWith('0x') ? deployerPrivateKey : `0x${deployerPrivateKey}`
      const signer = new ethers.Wallet(pk, provider)
      const contract = new ethers.Contract(contractAddress, LICENSE_ISSUER_ABI, signer)
      const block = await provider.getBlock('latest')
      const now = Number(block?.timestamp || Math.floor(Date.now() / 1000))
      const expiresAt = now + expiresInDays * 24 * 60 * 60
      const scopeBytes32 = ethers.encodeBytes32String(scopeRaw.slice(0, 31))
      const tx = await contract.issueLicense(holder, scopeBytes32, expiresAt)
      const receipt = await tx.wait()
      const issued = receipt?.logs
        ?.map((log) => {
          try {
            return contract.interface.parseLog(log)
          } catch {
            return null
          }
        })
        .find((ev) => ev?.name === 'LicenseIssued')
      const licenseId = issued?.args?.licenseId ? Number(issued.args.licenseId) : null
      return res.status(201).json({
        ok: true,
        holder,
        contractAddress,
        scope: scopeRaw,
        expiresAt,
        licenseId,
        txHash: receipt?.hash || tx.hash,
      })
    } catch (error) {
      return res.status(503).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  router.post(
    '/vaults/allocate',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const policyMode = String(req.body?.policyMode || 'allowlist')
        const allowedModes = new Set(['allowlist', 'owner', 'token', 'open'])
        if (!allowedModes.has(policyMode)) {
          return res.status(400).json({ ok: false, error: 'Invalid policyMode.' })
        }
        let tokenPolicy = null
        if (policyMode === 'token') {
          const parsed = parseTokenPolicyFromPayload(req.body)
          if (!parsed.ok) {
            return res.status(400).json({ ok: false, error: parsed.error })
          }
          tokenPolicy = parsed.tokenPolicy
        }
        const vaultId = `cdr_vault_${randomUUID()}`
        const wallet = String(req.get('x-user-wallet') || req.body?.wallet || '').trim().toLowerCase()
        const createdAt = nowIso()
        const vault = {
          vaultId,
          createdAt,
          policyMode,
          policyType: String(req.body?.policyType || 'Neighbourhood Health'),
          conditionRef:
            tokenPolicy?.contractAddress ||
            (req.body?.conditionRef ? String(req.body.conditionRef) : null),
          tokenPolicy,
          ownerWallet: wallet || 'unknown',
          purpose: String(req.body?.purpose || 'care_coordination'),
          status: 'allocated',
          assets: [],
          requests: [],
          revokedAt: null,
        }
        vaultStore.set(vaultId, vault)
        const evt = pushAudit({
          vaultId,
          action: 'vault_allocated',
          wallet: vault.ownerWallet,
          policyMode: vault.policyMode,
          policyType: vault.policyType,
          tokenPolicy: vault.tokenPolicy || null,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
        })
        return res.status(201).json({
          ok: true,
          vaultId,
          policyMode: vault.policyMode,
          policyType: vault.policyType,
          conditionRef: vault.conditionRef,
          tokenPolicy: vault.tokenPolicy || null,
          status: vault.status,
          auditEventId: evt.eventId,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
          disclaimer: 'Synthetic/demo only. Not clinical advice.',
        })
      },
    ),
  )

  router.post(
    '/vaults/:vaultId/encrypt-store',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const vault = vaultStore.get(req.params.vaultId)
        if (!vault) return res.status(404).json({ ok: false, error: 'Vault not found.' })
        if (vault.status === 'revoked') {
          return res.status(409).json({ ok: false, error: 'Vault revoked. Cannot store new assets.' })
        }
        const payloadText = String(req.body?.payloadText || '').trim()
        const payloadFile = req.body?.payloadFile && typeof req.body.payloadFile === 'object' ? req.body.payloadFile : null
        const fileMetadata =
          req.body?.fileMetadata && typeof req.body.fileMetadata === 'object' ? req.body.fileMetadata : null
        const hasText = payloadText.length > 0
        const hasFile =
          !!payloadFile &&
          typeof payloadFile.name === 'string' &&
          typeof payloadFile.type === 'string' &&
          typeof payloadFile.base64 === 'string'
        if (!hasText && !hasFile) {
          return res.status(400).json({ ok: false, error: 'Provide payloadText or payloadFile.' })
        }

        let payloadBytes = Buffer.alloc(0)
        let storage = { kind: 'inline_text', contentPreview: payloadText.slice(0, 120) }
        if (hasFile) {
          let fileBuffer
          try {
            fileBuffer = Buffer.from(payloadFile.base64, 'base64')
          } catch {
            return res.status(400).json({ ok: false, error: 'payloadFile.base64 must be valid base64.' })
          }
          if (!fileBuffer.length) {
            return res.status(400).json({ ok: false, error: 'Uploaded file is empty.' })
          }
          if (fileBuffer.length > 10 * 1024 * 1024) {
            return res.status(413).json({ ok: false, error: 'File too large for demo upload (max 10MB).' })
          }
          payloadBytes = fileBuffer
          const uploaded = await uploadFileToPinata({
            fileName: payloadFile.name.trim() || `cdr-upload-${Date.now()}`,
            mimeType: payloadFile.type.trim() || 'application/octet-stream',
            fileBuffer,
          })
          if (!uploaded.ok) {
            return res.status(503).json({ ok: false, error: uploaded.error })
          }
          let metadata = null
          if (fileMetadata && fileMetadata.nftStyle === true) {
            const metadataBody = {
              pinataContent: {
                name: String(fileMetadata.name || payloadFile.name || 'CDR File').trim() || 'CDR File',
                description: String(fileMetadata.description || '').trim() || 'Clinical Arc CDR file metadata',
                image: `${PINATA_GATEWAY_BASE}/${uploaded.cid}`,
                animation_url: `${PINATA_GATEWAY_BASE}/${uploaded.cid}`,
                external_url: `${PINATA_GATEWAY_BASE}/${uploaded.cid}`,
                attributes: [
                  { trait_type: 'mime_type', value: payloadFile.type || 'application/octet-stream' },
                  { trait_type: 'source', value: 'clinical-arc-cdr' },
                  ...(Array.isArray(fileMetadata.tags)
                    ? fileMetadata.tags
                        .filter((t) => typeof t === 'string' && t.trim())
                        .map((t) => ({ trait_type: 'tag', value: t.trim() }))
                    : []),
                ],
                file_cid: uploaded.cid,
                file_url: `${PINATA_GATEWAY_BASE}/${uploaded.cid}`,
              },
              pinataMetadata: {
                name: `${String(fileMetadata.name || payloadFile.name || 'cdr-file').trim() || 'cdr-file'}-metadata`,
                keyvalues: { source: 'clinical-arc-cdr', kind: 'nft-style-metadata' },
              },
            }
            const metadataUpload = await uploadJsonToPinata({ body: metadataBody })
            if (!metadataUpload.ok) {
              return res.status(503).json({ ok: false, error: metadataUpload.error })
            }
            metadata = {
              kind: 'nft_style',
              cid: metadataUpload.cid,
              ipfsUri: metadataUpload.ipfsUri,
              gatewayUrl: metadataUpload.gatewayUrl,
              tokenUri: metadataUpload.ipfsUri,
            }
          }
          storage = {
            kind: 'pinata_ipfs',
            cid: uploaded.cid,
            ipfsUri: uploaded.ipfsUri,
            gatewayUrl: uploaded.gatewayUrl,
            fileName: payloadFile.name,
            mimeType: payloadFile.type,
            metadata,
          }
        } else {
          payloadBytes = Buffer.from(payloadText, 'utf8')
        }

        const assetId = `cdr_asset_${randomUUID()}`
        const digest = `sha256:${payloadBytes.toString('hex').slice(0, 32)}`
        const envelopeRef = `story-envelope:${randomUUID()}`
        const asset = {
          assetId,
          contentType: String(req.body?.contentType || 'clinical_note_json'),
          digest,
          envelopeRef,
          storedAt: nowIso(),
          bytes: payloadBytes.length,
          unlockState: 'locked',
          storage,
          demoOnly: true,
        }
        vault.assets.unshift(asset)
        vault.status = 'sealed'
        const evt = pushAudit({
          vaultId: vault.vaultId,
          action: 'asset_encrypted_stored',
          assetId,
          digest,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
        })
        return res.status(201).json({
          ok: true,
          vaultId: vault.vaultId,
          asset,
          status: vault.status,
          auditEventId: evt.eventId,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
          disclaimer: 'Synthetic/demo only. Not clinical advice.',
        })
      },
    ),
  )

  router.post(
    '/vaults/:vaultId/request-access',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const vault = vaultStore.get(req.params.vaultId)
        if (!vault) return res.status(404).json({ ok: false, error: 'Vault not found.' })
        if (vault.status === 'revoked') return res.status(409).json({ ok: false, error: 'Vault revoked.' })
        const requesterWallet = String(req.get('x-user-wallet') || req.body?.requesterWallet || '').trim().toLowerCase()
        if (vault.policyMode === 'token') {
          const check = await verifyTokenPolicyAccess({ tokenPolicy: vault.tokenPolicy, requesterWallet })
          if (!check.ok) {
            const evt = pushAudit({
              vaultId: vault.vaultId,
              action: 'access_authorization_error',
              requesterWallet: requesterWallet || null,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              details: check.error || null,
              tokenPolicy: vault.tokenPolicy || null,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
            return res.status(503).json({
              ok: false,
              vaultId: vault.vaultId,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              error: check.error || 'Token/license authorization check failed.',
              auditEventId: evt.eventId,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
          }
          if (!check.allowed) {
            const evt = pushAudit({
              vaultId: vault.vaultId,
              action: 'access_denied',
              requesterWallet: requesterWallet || null,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              rawCode: check.rawCode,
              tokenPolicy: vault.tokenPolicy || null,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
            return res.status(403).json({
              ok: false,
              vaultId: vault.vaultId,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              tokenPolicy: vault.tokenPolicy || null,
              auditEventId: evt.eventId,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
          }
        }
        const requestId = `cdr_req_${randomUUID()}`
        const reqItem = {
          requestId,
          requesterRole: String(req.body?.requesterRole || 'gp'),
          requesterWallet: requesterWallet || null,
          purpose: String(req.body?.purpose || 'care_coordination'),
          requestedAt: nowIso(),
          status: 'requested',
          partialShares: 0,
        }
        vault.requests.unshift(reqItem)
        vault.status = 'access_pending'
        const evt = pushAudit({
          vaultId: vault.vaultId,
          action: 'access_requested',
          requestId,
          requesterRole: reqItem.requesterRole,
          requesterWallet: reqItem.requesterWallet,
          authorizationStatus: vault.policyMode === 'token' ? 'authorized' : 'not_required',
          reason: vault.policyMode === 'token' ? 'ok' : 'not_applicable',
          tokenPolicy: vault.tokenPolicy || null,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
        })
        return res.status(201).json({
          ok: true,
          vaultId: vault.vaultId,
          request: reqItem,
          tokenPolicy: vault.tokenPolicy || null,
          status: vault.status,
          auditEventId: evt.eventId,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
          disclaimer: 'Synthetic/demo only. Not clinical advice.',
        })
      },
    ),
  )

  router.post(
    '/vaults/:vaultId/recover',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const vault = vaultStore.get(req.params.vaultId)
        if (!vault) return res.status(404).json({ ok: false, error: 'Vault not found.' })
        if (vault.assets.length === 0) return res.status(409).json({ ok: false, error: 'No encrypted asset in vault.' })
        const pending = vault.requests.find((r) => r.status === 'requested')
        if (!pending) return res.status(409).json({ ok: false, error: 'No pending access request found.' })
        if (vault.policyMode === 'token') {
          const requesterWallet = String(pending.requesterWallet || req.get('x-user-wallet') || '').trim().toLowerCase()
          const check = await verifyTokenPolicyAccess({ tokenPolicy: vault.tokenPolicy, requesterWallet })
          if (!check.ok) {
            const evt = pushAudit({
              vaultId: vault.vaultId,
              action: 'recovery_authorization_error',
              requestId: pending.requestId,
              requesterWallet: requesterWallet || null,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              details: check.error || null,
              tokenPolicy: vault.tokenPolicy || null,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
            return res.status(503).json({
              ok: false,
              vaultId: vault.vaultId,
              requestId: pending.requestId,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              error: check.error || 'Token/license authorization check failed.',
              tokenPolicy: vault.tokenPolicy || null,
              auditEventId: evt.eventId,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
          }
          if (!check.allowed) {
            const evt = pushAudit({
              vaultId: vault.vaultId,
              action: 'recovery_denied',
              requestId: pending.requestId,
              requesterWallet: requesterWallet || null,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              rawCode: check.rawCode,
              tokenPolicy: vault.tokenPolicy || null,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
            return res.status(403).json({
              ok: false,
              vaultId: vault.vaultId,
              requestId: pending.requestId,
              authorizationStatus: check.authorizationStatus,
              reason: check.reason,
              tokenPolicy: vault.tokenPolicy || null,
              auditEventId: evt.eventId,
              receiptRef: paymentCtx.paymentReceiptRef ?? null,
            })
          }
        }
        pending.status = 'recovered'
        pending.partialShares = 3
        pending.recoveredAt = nowIso()
        vault.status = 'recovered'
        const evt = pushAudit({
          vaultId: vault.vaultId,
          action: 'cooperative_recovery_completed',
          requestId: pending.requestId,
          sharesCollected: pending.partialShares,
          requesterWallet: pending.requesterWallet || null,
          authorizationStatus: vault.policyMode === 'token' ? 'authorized' : 'not_required',
          reason: vault.policyMode === 'token' ? 'ok' : 'not_applicable',
          tokenPolicy: vault.tokenPolicy || null,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
        })
        return res.status(200).json({
          ok: true,
          vaultId: vault.vaultId,
          requestId: pending.requestId,
          decryptResult: {
            unlocked: true,
            recoveryMode: 'threshold-demo',
            sharesCollected: pending.partialShares,
            contentPreview: '[decrypted-demo-payload-redacted]',
          },
          tokenPolicy: vault.tokenPolicy || null,
          status: vault.status,
          auditEventId: evt.eventId,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
          disclaimer: 'Synthetic/demo only. Not clinical advice.',
        })
      },
    ),
  )

  router.post(
    '/vaults/:vaultId/revoke',
    ...gate(
      { enabled: paymentGateEnabled, amount: '0.01' },
      async (req, res, paymentCtx) => {
        const vault = vaultStore.get(req.params.vaultId)
        if (!vault) return res.status(404).json({ ok: false, error: 'Vault not found.' })
        vault.status = 'revoked'
        vault.revokedAt = nowIso()
        const evt = pushAudit({
          vaultId: vault.vaultId,
          action: 'vault_revoked',
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
        })
        return res.status(200).json({
          ok: true,
          vaultId: vault.vaultId,
          status: vault.status,
          revokedAt: vault.revokedAt,
          auditEventId: evt.eventId,
          receiptRef: paymentCtx.paymentReceiptRef ?? null,
          disclaimer: 'Synthetic/demo only. Not clinical advice.',
        })
      },
    ),
  )

  router.get('/vaults/:vaultId', (req, res) => {
    const vault = vaultStore.get(req.params.vaultId)
    if (!vault) return res.status(404).json({ ok: false, error: 'Vault not found.' })
    return res.status(200).json({ ok: true, vault: makeVaultSnapshot(vault) })
  })

  router.get('/audit', (req, res) => {
    const limitRaw = Number.parseInt(String(req.query.limit || '25'), 10)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 25
    const vaultIdFilter = typeof req.query.vaultId === 'string' ? req.query.vaultId.trim() : ''
    const rows = (vaultIdFilter ? auditEvents.filter((e) => e.vaultId === vaultIdFilter) : auditEvents).slice(0, limit)
    return res.status(200).json({
      ok: true,
      count: rows.length,
      rows,
      demoOnly: true,
      generatedAt: nowIso(),
      disclaimer: 'Synthetic/demo only. Not clinical advice.',
    })
  })

  return router
}
