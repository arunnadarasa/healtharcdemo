import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { Receipt } from './receiptWire.js'
import * as x402Env from './x402Env.js'
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { createPublicClient, http, parseUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import {
  createBattleEntryIntent,
  createBeatLicenseIntent,
  createMockReceipt,
  endCoachingSession,
  executeBattlePayout,
  finalizeBattleResults,
  getBattlePayoutExecution,
  getCoachingReceipt,
  getVirtualDebitCard,
  grantBeatLicense,
  recoverBattleEntryPayment,
  startCoachingSession,
  tickCoachingSession,
  createVirtualDebitCard,
  verifyBattleEntryPayment,
} from './payments.js'
import { buildOpenApiDocument, DANCE_EXTRA_LIVE_AMOUNTS } from './openapi.mjs'
import { createNhsRouter } from './nhs/router.js'
import { mountCircleModularProxy } from './circleModularProxy.js'
import { createNeighbourhoodRouter } from './neighbourhood/router.js'
import { createOpenehrBffRouter } from './openehr/bffRouter.js'
import {
  createNeighbourhoodThirdwebPaymentMiddleware,
  createCdrThirdwebPaymentMiddleware,
  createDmdThirdwebPaymentMiddleware,
  createOpenehrThirdwebPaymentMiddleware,
  createSnomedThirdwebPaymentMiddleware,
  isThirdwebSettlementConfigured,
} from './thirdwebX402.js'
import { resolveNhsX402Facilitator } from './x402FacilitatorContext.js'
import { createSnomedRouter } from './snomed/router.js'
import { createDmdRouter } from './dmd/router.js'
import { createCdrRouter } from './cdr/router.js'

const app = express()
/** So `req.protocol` / forwarded headers match the browser origin when Vite proxies (localhost:5173 → 8787). */
app.set('trust proxy', 1)

/** Optional CORS for browser → API (e.g. Fly + Lovable). Comma-separated origins; unset = disabled. */
const flyCorsOrigins = (process.env.FLY_PUBLIC_CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
if (flyCorsOrigins.length) {
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || '')
    const allowed = origin && flyCorsOrigins.includes(origin)
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
    const reqHdrs = req.headers['access-control-request-headers']
    res.setHeader(
      'Access-Control-Allow-Headers',
      typeof reqHdrs === 'string' && reqHdrs.trim()
        ? reqHdrs
        : 'Content-Type, Authorization, X-X402-Facilitator, X-Payment, X-Payment-Response',
    )
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
}

const port = Number(process.env.PORT || 8787)

const openAiGatewayUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})
const x402SellerAddress = x402Env.x402SellerAddress()

/** Circle Gateway batched x402 — Arc Testnet (`eip155:5042002`). @see https://developers.circle.com/gateway/nanopayments */
const arcGateway = createGatewayMiddleware({
  sellerAddress: x402SellerAddress,
  networks: ['eip155:5042002'],
})
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000'
const ARC_TESTNET_GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
const GATEWAY_API_TESTNET = 'https://gateway-api-testnet.circle.com/v1'
const ARC_GATEWAY_DOMAIN = 26

function gatewayRequireUsd(price) {
  const s = typeof price === 'number' ? price.toFixed(2) : String(price)
  const withDollar = s.startsWith('$') ? s : `$${s}`
  return (req, res, next) => arcGateway.require(withDollar)(req, res, next)
}

function circleDevWalletClientOrError() {
  const apiKey = process.env.CIRCLE_API_KEY?.trim()
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim()
  if (!apiKey || !entitySecret) {
    return {
      error:
        'Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET on the server. Set them in .env and restart the API.',
    }
  }
  return { client: initiateDeveloperControlledWalletsClient({ apiKey, entitySecret }) }
}

const judgeScores = []
const cypherMicropots = new Map()
const clipSales = new Map()
const reputationAttestations = []
const studioUsageEvents = []
const botActions = []
const fanPasses = new Map()
const coachingLiveRecoveryByTx = new Map()
const beatsLiveRecoveryByTx = new Map()
// Laso card x402 wrapper returns bearer tokens (id_token/refresh_token) with the card order.
// We need them to poll /get-card-data for the real card details later.
const lasoCardAuthById = new Map()
// When Laso rejects (e.g., geo restriction like "US only"), we fall back to the local mock card.
const lasoCardDemoReasonById = new Map()

const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
})

mountCircleModularProxy(app)

app.use(express.json({ limit: '1mb' }))

app.use((req, res, next) => {
  if (req.path === '/api/neighbourhood/insights/lsoa') {
  }
  next()
})

function toFetchRequest(req) {
  const origin = `${req.protocol}://${req.get('host')}`
  const url = new URL(req.originalUrl, origin).toString()
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (typeof value === 'string') {
      headers.set(key, value)
    }
  }
  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : JSON.stringify(req.body ?? {})
  return new Request(url, { method: req.method, headers, body })
}

/**
 * Forward a fetch Response to Express. We buffer the body with `res.send()`, so we must not
 * forward `Content-Length` + `Transfer-Encoding` from upstream — that pair is illegal in HTTP/1.1
 * and breaks Node's client (e.g. Vite's proxy to this server): "Parse Error: Content-Length can't
 * be present with Transfer-Encoding".
 */
async function sendFetchResponse(res, fetchResponse) {
  res.status(fetchResponse.status)
  fetchResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (
      lower === 'transfer-encoding' ||
      lower === 'content-length' ||
      lower === 'content-encoding' ||
      lower === 'connection' ||
      lower === 'keep-alive'
    ) {
      return
    }
    res.setHeader(key, value)
  })
  const text = await fetchResponse.text()
  res.send(text)
}

function getForwardAuthHeaders(req) {
  const headers = {}
  const authorization = req.get('authorization')
  const payment = req.get('payment')
  const paymentReceipt = req.get('payment-receipt')
  const signInWithX = req.get('sign-in-with-x')
  if (typeof authorization === 'string' && authorization.length > 0) {
    headers.Authorization = authorization
  }
  if (typeof payment === 'string' && payment.length > 0) {
    headers.Payment = payment
  }
  if (typeof paymentReceipt === 'string' && paymentReceipt.length > 0) {
    headers['Payment-Receipt'] = paymentReceipt
  }
  // StableSocial GET /api/jobs uses x402 SIWX (not payment) when accepts is empty.
  if (typeof signInWithX === 'string' && signInWithX.length > 0) {
    headers['sign-in-with-x'] = signInWithX
  }
  return headers
}

/** Arc Testnet network selector from JSON body (legacy mainnet/testnet tabs → same chain until Arc mainnet is available in viem). */
function normalizeArcNetworkFromBody(body) {
  const n = body?.network
  if (n === 'mainnet' || n === 4217 || n === '4217') return { network: 'mainnet', chainId: 5042002 }
  return { network: 'testnet', chainId: 5042002 }
}

/** Per-flow USD charge — imported from openapi.mjs (single source for /openapi.json). */

/**
 * Shared scaffold logic for the seven hub “extra” HealthTech flows (also used by live x402 demo routes).
 * @returns {{ ok: true, status: number, result: object } | { ok: false, status: number, error: string }}
 */
function executeDanceExtraFlow(flowKey, body) {
  const arcNet = normalizeArcNetworkFromBody(body ?? {})
  switch (flowKey) {
    case 'judge-score': {
      const { battleId, roundId, judgeId, dancerId, score } = body ?? {}
      if (
        typeof battleId !== 'string' ||
        typeof roundId !== 'string' ||
        typeof judgeId !== 'string' ||
        typeof dancerId !== 'string' ||
        typeof score !== 'number'
      ) {
        return {
          ok: false,
          status: 400,
          error: 'Invalid payload. Expected battleId, roundId, judgeId, dancerId (strings) and score (number).',
        }
      }
      const entry = {
        id: judgeScores.length + 1,
        battleId,
        roundId,
        judgeId,
        dancerId,
        score,
        createdAt: new Date().toISOString(),
      }
      judgeScores.push(entry)
      const receipt = Receipt.from({
        method: 'x402',
        reference: `mock_score_${battleId}_${roundId}_${judgeId}_${dancerId}`,
        status: 'success',
        timestamp: entry.createdAt,
        externalId: `score_${entry.id}`,
      })
      return {
        ok: true,
        status: 201,
        result: { ...entry, receipt, network: arcNet.network, chainId: arcNet.chainId },
      }
    }
    case 'cypher-micropot': {
      const { cypherId, dancerId, amount } = body ?? {}
      if (typeof cypherId !== 'string' || typeof dancerId !== 'string' || typeof amount !== 'number') {
        return {
          ok: false,
          status: 400,
          error: 'Invalid payload. Expected cypherId, dancerId (strings) and amount (number).',
        }
      }
      const pot =
        cypherMicropots.get(cypherId) ??
        {
          cypherId,
          total: 0,
          contributions: [],
        }
      const contribution = {
        dancerId,
        amount,
        contributedAt: new Date().toISOString(),
      }
      pot.total += amount
      pot.contributions.push(contribution)
      cypherMicropots.set(cypherId, pot)
      return {
        ok: true,
        status: 201,
        result: { ...pot, network: arcNet.network, chainId: arcNet.chainId },
      }
    }
    case 'clip-sale': {
      const { clipId, buyerId, totalAmount, splits } = body ?? {}
      if (typeof clipId !== 'string' || typeof buyerId !== 'string') {
        return { ok: false, status: 400, error: 'Invalid payload. Expected clipId and buyerId as strings.' }
      }
      if (!Array.isArray(splits) || splits.length === 0) {
        return { ok: false, status: 400, error: 'Invalid payload. Expected non-empty splits[].' }
      }
      const saleId = `clip_${clipId}_${Date.now()}`
      const createdAt = new Date().toISOString()
      const receipt = Receipt.from({
        method: 'x402',
        reference: `mock_clip_${clipId}_${saleId}`,
        status: 'success',
        timestamp: createdAt,
        externalId: saleId,
      })
      const sale = {
        saleId,
        clipId,
        buyerId,
        totalAmount,
        splits,
        createdAt,
        receipt,
      }
      clipSales.set(saleId, sale)
      return {
        ok: true,
        status: 201,
        result: { ...sale, network: arcNet.network, chainId: arcNet.chainId },
      }
    }
    case 'reputation': {
      const { issuerId, dancerId, type, eventId } = body ?? {}
      if (typeof issuerId !== 'string' || typeof dancerId !== 'string' || typeof type !== 'string') {
        return {
          ok: false,
          status: 400,
          error: 'Invalid payload. Expected issuerId, dancerId, type as strings.',
        }
      }
      const attestation = {
        id: reputationAttestations.length + 1,
        issuerId,
        dancerId,
        type,
        eventId: typeof eventId === 'string' ? eventId : null,
        createdAt: new Date().toISOString(),
      }
      reputationAttestations.push(attestation)
      const receipt = Receipt.from({
        method: 'x402',
        reference: `mock_reputation_${attestation.id}`,
        status: 'success',
        timestamp: attestation.createdAt,
        externalId: `reputation_${attestation.id}`,
      })
      return {
        ok: true,
        status: 201,
        result: { ...attestation, receipt, network: arcNet.network, chainId: arcNet.chainId },
      }
    }
    case 'ai-usage': {
      const { studioId, toolId, units, mode } = body ?? {}
      if (typeof studioId !== 'string' || typeof toolId !== 'string' || typeof units !== 'number') {
        return {
          ok: false,
          status: 400,
          error: 'Invalid payload. Expected studioId, toolId (strings) and units (number).',
        }
      }
      const entry = {
        id: studioUsageEvents.length + 1,
        studioId,
        toolId,
        units,
        mode: mode === 'session' ? 'session' : 'charge',
        createdAt: new Date().toISOString(),
      }
      studioUsageEvents.push(entry)
      const receipt = Receipt.from({
        method: 'x402',
        reference: `mock_ai_${entry.toolId}_${entry.id}`,
        status: 'success',
        timestamp: entry.createdAt,
        externalId: `ai_${entry.id}`,
      })
      return {
        ok: true,
        status: 201,
        result: { ...entry, receipt, network: arcNet.network, chainId: arcNet.chainId },
      }
    }
    case 'bot-action': {
      const { eventId, actionType, payload } = body ?? {}
      if (typeof eventId !== 'string' || typeof actionType !== 'string') {
        return { ok: false, status: 400, error: 'Invalid payload. Expected eventId and actionType as strings.' }
      }
      const action = {
        id: botActions.length + 1,
        eventId,
        actionType,
        payload: payload ?? {},
        createdAt: new Date().toISOString(),
      }
      botActions.push(action)
      const receipt = Receipt.from({
        method: 'x402',
        reference: `mock_bot_${eventId}_${action.id}`,
        status: 'success',
        timestamp: action.createdAt,
        externalId: `bot_${action.id}`,
      })
      return {
        ok: true,
        status: 201,
        result: { ...action, receipt, network: arcNet.network, chainId: arcNet.chainId },
      }
    }
    case 'fan-pass': {
      const { fanId, tier } = body ?? {}
      if (typeof fanId !== 'string') {
        return { ok: false, status: 400, error: 'Invalid payload. Expected fanId as a string.' }
      }
      const passId = `pass_${fanId}_${Date.now()}`
      const createdAt = new Date().toISOString()
      const receipt = Receipt.from({
        method: 'x402',
        reference: `mock_pass_${fanId}_${passId}`,
        status: 'success',
        timestamp: createdAt,
        externalId: passId,
      })
      const pass = {
        passId,
        fanId,
        tier: typeof tier === 'string' ? tier : 'standard',
        createdAt,
        perks: ['livestream_chat', 'backstage_qna', 'discounts'],
        receipt,
      }
      fanPasses.set(passId, pass)
      return {
        ok: true,
        status: 201,
        result: { ...pass, network: arcNet.network, chainId: arcNet.chainId },
      }
    }
    default:
      return { ok: false, status: 400, error: 'Unknown dance extra flow.' }
  }
}

/** OpenAPI 3.1 at canonical path — see docs/OPENAPI_DISCOVERY.md */
app.get('/openapi.json', (req, res) => {
  res.type('application/json').send(JSON.stringify(buildOpenApiDocument(req)))
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-proxy' })
})

const nhsPaymentGateEnabled = process.env.NHS_ENABLE_PAYMENT_GATE !== 'false'
const thirdwebSettlementReady = isThirdwebSettlementConfigured()

app.use(resolveNhsX402Facilitator)

if (nhsPaymentGateEnabled && thirdwebSettlementReady) {
  app.use('/api/neighbourhood', createNeighbourhoodThirdwebPaymentMiddleware())
  app.use('/api/openehr', createOpenehrThirdwebPaymentMiddleware())
  app.use('/api/dmd', createDmdThirdwebPaymentMiddleware())
  app.use('/api/snomed', createSnomedThirdwebPaymentMiddleware())
  app.use('/api/cdr', createCdrThirdwebPaymentMiddleware())
}

app.use(
  '/api/nhs',
  createNhsRouter({
    gateway: arcGateway,
  }),
)

app.use(
  '/api/neighbourhood',
  createNeighbourhoodRouter({
    gateway: arcGateway,
    skipInternalGateway: (req) => req.nhsX402Facilitator === 'thirdweb',
  }),
)

app.use(
  '/api/openehr',
  createOpenehrBffRouter({
    gateway: arcGateway,
    skipInternalGateway: (req) => req.nhsX402Facilitator === 'thirdweb',
  }),
)

/** SNOMED CT via optional [Snowstorm](https://github.com/IHTSDO/snowstorm) — read-only FHIR $lookup; local RF2 GET + paid POST search */
app.use(
  '/api/snomed',
  createSnomedRouter({
    gateway: arcGateway,
    skipInternalGateway: (req) => req.nhsX402Facilitator === 'thirdweb',
  }),
)
app.use(
  '/api/dmd',
  createDmdRouter({
    gateway: arcGateway,
    skipInternalGateway: (req) => req.nhsX402Facilitator === 'thirdweb',
  }),
)
app.use(
  '/api/cdr',
  createCdrRouter({
    gateway: arcGateway,
    skipInternalGateway: (req) => req.nhsX402Facilitator === 'thirdweb',
  }),
)

// Arc Testnet: use Circle’s public faucet for USDC + native gas — see https://docs.arc.network/arc/references/connect-to-arc
app.post('/api/arc/faucet', async (req, res) => {
  const { address } = req.body ?? {}

  if (typeof address !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected address as a string.',
    })
  }

  const normalized = address.trim().toLowerCase()
  if (!normalized.startsWith('0x') || normalized.length < 4) {
    return res.status(400).json({
      error: 'Invalid address format. Expected 0x-prefixed address.',
    })
  }

  return res.status(200).json({
    ok: true,
    network: 'arc-testnet',
    chainId: 5042002,
    message: 'Use the Circle Faucet for Arc Testnet USDC and gas.',
    faucetUrl: 'https://faucet.circle.com',
    docsUrl: 'https://docs.arc.network/arc/references/connect-to-arc',
    address: normalized,
  })
})

/** Circle developer-controlled ARC wallet (server-side; secrets never touch browser). */
app.post('/api/circle/dev-wallet', async (_req, res) => {
  const { client, error } = circleDevWalletClientOrError()
  if (error) return res.status(500).json({ error })

  try {
    const walletSet = await client.createWalletSet({
      name: `ClinicalArc ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      idempotencyKey: randomUUID(),
    })
    const walletSetId = walletSet?.data?.walletSet?.id
    if (!walletSetId) {
      return res.status(502).json({ error: 'Circle createWalletSet did not return walletSet id.' })
    }

    const walletsRes = await client.createWallets({
      walletSetId,
      blockchains: ['ARC-TESTNET'],
      count: 1,
      idempotencyKey: randomUUID(),
    })
    const created = walletsRes?.data?.wallets?.[0]
    if (!created?.id || !created?.address) {
      return res.status(502).json({ error: 'Circle createWallets did not return wallet id/address.' })
    }

    return res.status(201).json({
      ok: true,
      walletSetId,
      walletId: created.id,
      address: created.address,
      blockchain: 'ARC-TESTNET',
      note: 'Fund this Circle wallet via https://faucet.circle.com before submitting paid transactions.',
    })
  } catch (e) {
    const status = Number(e?.response?.status) || 502
    const details = e?.response?.data ?? e?.message ?? String(e)
    return res.status(status).json({ error: 'Circle wallet creation failed.', details })
  }
})

/** Server-side EIP-712 signing for Circle developer-controlled wallets (used by x402 Circle mode). */
app.post('/api/circle/sign-typed-data', async (req, res) => {
  const { client, error } = circleDevWalletClientOrError()
  if (error) return res.status(500).json({ error })

  const walletId = typeof req.body?.walletId === 'string' ? req.body.walletId.trim() : ''
  const walletAddress = typeof req.body?.walletAddress === 'string' ? req.body.walletAddress.trim().toLowerCase() : ''
  const typedData = req.body?.typedData
  if (!walletId || !typedData || typeof typedData !== 'object') {
    return res.status(400).json({
      error: 'Invalid payload. Expected walletId (string) and typedData (object).',
    })
  }

  try {
    if (walletAddress) {
      const walletRes = await client.getWallet({ id: walletId })
      const actual = String(walletRes?.data?.wallet?.address || '').toLowerCase()
      if (!actual) return res.status(404).json({ error: 'Circle wallet not found.' })
      if (actual !== walletAddress) {
        return res.status(403).json({ error: 'walletAddress does not match walletId.' })
      }
    }

    const canonical = canonicalizeEip712TypedData(typedData)
    const typedDataJson = JSON.stringify(canonical)
    let signRes
    if (walletAddress) {
      try {
        signRes = await client.signTypedData({
          walletAddress,
          blockchain: 'ARC-TESTNET',
          data: typedDataJson,
          memo: 'ClinicalArc x402 payment signature',
          idempotencyKey: randomUUID(),
        })
      } catch {
        signRes = await client.signTypedData({
          walletId,
          data: typedDataJson,
          memo: 'ClinicalArc x402 payment signature',
          idempotencyKey: randomUUID(),
        })
      }
    } else {
      signRes = await client.signTypedData({
        walletId,
        data: typedDataJson,
        memo: 'ClinicalArc x402 payment signature',
        idempotencyKey: randomUUID(),
      })
    }
    const signature = signRes?.data?.signature
    if (!signature) {
      return res.status(502).json({ error: 'Circle signTypedData did not return signature.' })
    }
    return res.status(200).json({ ok: true, walletId, signature })
  } catch (e) {
    const status = Number(e?.response?.status) || 502
    const details = e?.response?.data ?? e?.message ?? String(e)
    console.error('[circle-sign-typed-data] failed', { status, details })
    return res.status(status).json({ error: 'Circle typed-data signing failed.', details })
  }
})

/** Top up Circle Gateway balance using Circle developer wallet (approve + deposit). */
app.post('/api/circle/gateway-deposit', async (req, res) => {
  const { client, error } = circleDevWalletClientOrError()
  if (error) return res.status(500).json({ error })

  const walletId = typeof req.body?.walletId === 'string' ? req.body.walletId.trim() : ''
  const walletAddress = typeof req.body?.walletAddress === 'string' ? req.body.walletAddress.trim().toLowerCase() : ''
  const amountHuman = typeof req.body?.amount === 'string' ? req.body.amount.trim() : ''
  if (!walletId || !walletAddress || !/^\d+(\.\d+)?$/.test(amountHuman) || Number(amountHuman) <= 0) {
    return res.status(400).json({
      error: 'Invalid payload. Expected walletId, walletAddress, amount (> 0).',
    })
  }

  try {
    const walletRes = await client.getWallet({ id: walletId })
    const actual = String(walletRes?.data?.wallet?.address || '').toLowerCase()
    if (!actual) return res.status(404).json({ error: 'Circle wallet not found.' })
    if (actual !== walletAddress) {
      return res.status(403).json({ error: 'walletAddress does not match walletId.' })
    }

    const amountRaw = parseUnits(amountHuman, 6).toString()
    const fee = { type: 'level', config: { feeLevel: 'MEDIUM' } }
    const approveTx = await client.createContractExecutionTransaction({
      walletId,
      amount: '0',
      contractAddress: ARC_TESTNET_USDC,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [ARC_TESTNET_GATEWAY_WALLET, amountRaw],
      fee,
      idempotencyKey: randomUUID(),
      refId: 'clinicalarc-circle-gateway-approve',
    })

    const depositTx = await client.createContractExecutionTransaction({
      walletId,
      amount: '0',
      contractAddress: ARC_TESTNET_GATEWAY_WALLET,
      abiFunctionSignature: 'deposit(address,uint256)',
      abiParameters: [ARC_TESTNET_USDC, amountRaw],
      fee,
      idempotencyKey: randomUUID(),
      refId: 'clinicalarc-circle-gateway-deposit',
    })

    return res.status(200).json({
      ok: true,
      walletId,
      walletAddress,
      amount: amountHuman,
      approveTxId: approveTx?.data?.id ?? null,
      approveTxHash: approveTx?.data?.txHash ?? null,
      depositTxId: depositTx?.data?.id ?? null,
      depositTxHash: depositTx?.data?.txHash ?? null,
      note: 'Circle submitted approve + deposit transactions. Refresh balances after confirmation.',
    })
  } catch (e) {
    const status = Number(e?.response?.status) || 502
    const details = e?.response?.data ?? e?.message ?? String(e)
    return res.status(status).json({ error: 'Circle Gateway deposit failed.', details })
  }
})

/** Read Circle Gateway available USDC for a depositor address (Arc Testnet). */
app.post('/api/circle/gateway-balance', async (req, res) => {
  const walletAddress = typeof req.body?.walletAddress === 'string' ? req.body.walletAddress.trim().toLowerCase() : ''
  if (!walletAddress || !walletAddress.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid payload. Expected walletAddress.' })
  }
  try {
    const r = await fetch(`${GATEWAY_API_TESTNET}/balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'USDC',
        sources: [{ depositor: walletAddress, domain: ARC_GATEWAY_DOMAIN }],
      }),
    })
    const payload = await r.json().catch(() => ({}))
    if (!r.ok) {
      return res.status(r.status).json({
        error: payload?.message || `Gateway balance request failed (HTTP ${r.status}).`,
        details: payload,
      })
    }
    const balance = Array.isArray(payload?.balances) && payload.balances[0] ? String(payload.balances[0].balance || '0') : '0'
    return res.status(200).json({ ok: true, walletAddress, balance, token: 'USDC' })
  } catch (e) {
    return res.status(502).json({ error: 'Circle Gateway balance request failed.', details: e?.message ?? String(e) })
  }
})

function canonicalizeEip712TypedData(input) {
  const src = input && typeof input === 'object' ? input : {}
  const typesRaw = src.types && typeof src.types === 'object' ? src.types : {}
  const primaryTypeRaw = typeof src.primaryType === 'string' ? src.primaryType : ''
  const candidatePrimaryTypes = Object.keys(typesRaw).filter((k) => k !== 'EIP712Domain')
  const primaryType = candidatePrimaryTypes.includes(primaryTypeRaw)
    ? primaryTypeRaw
    : candidatePrimaryTypes[0] || primaryTypeRaw || 'Data'

  const normalizedTypes = {}
  for (const [typeName, fields] of Object.entries(typesRaw)) {
    if (!Array.isArray(fields)) continue
    normalizedTypes[typeName] = fields
      .filter((f) => f && typeof f === 'object' && typeof f.name === 'string' && typeof f.type === 'string')
      .map((f) => ({ name: f.name, type: f.type }))
  }
  if (!Array.isArray(normalizedTypes.EIP712Domain) || normalizedTypes.EIP712Domain.length === 0) {
    normalizedTypes.EIP712Domain = inferEip712DomainType(src.domain)
  }
  if (!normalizedTypes[primaryType]) {
    normalizedTypes[primaryType] = inferTypeFromMessage(src.message)
  }

  const domain = normalizeByType(src.domain, 'EIP712Domain', normalizedTypes)
  const message = normalizeByType(src.message, primaryType, normalizedTypes)
  const out = {
    types: normalizedTypes,
    primaryType,
    domain,
    message,
  }
  return JSON.parse(
    JSON.stringify(out, (_k, v) => {
      if (typeof v === 'bigint') return v.toString()
      return v
    }),
  )
}

function inferTypeFromMessage(message) {
  const src = message && typeof message === 'object' ? message : {}
  return Object.keys(src).map((name) => ({ name, type: 'string' }))
}

function inferEip712DomainType(domain) {
  const src = domain && typeof domain === 'object' ? domain : {}
  const known = {
    name: 'string',
    version: 'string',
    chainId: 'uint256',
    verifyingContract: 'address',
    salt: 'bytes32',
  }
  return Object.keys(src).map((name) => ({ name, type: known[name] || 'string' }))
}

function normalizeByType(source, typeName, typesMap) {
  const typeDef = Array.isArray(typesMap?.[typeName]) ? typesMap[typeName] : null
  const src = source && typeof source === 'object' ? source : {}
  if (!Array.isArray(typeDef)) return src
  const out = {}
  for (const def of typeDef) {
    if (!def || typeof def !== 'object' || typeof def.name !== 'string') continue
    if (!Object.prototype.hasOwnProperty.call(src, def.name)) continue
    out[def.name] = normalizeTypedValue(src[def.name], def.type, typesMap)
  }
  return out
}

function normalizeTypedValue(value, typeName, typesMap) {
  if (typeof value === 'bigint') return value.toString()
  if (value == null) return value
  if (typeName.endsWith('[]')) {
    const baseType = typeName.slice(0, -2)
    if (!Array.isArray(value)) return []
    return value.map((v) => normalizeTypedValue(v, baseType, typesMap))
  }
  if (typesMap?.[typeName]) {
    return normalizeByType(value, typeName, typesMap)
  }
  return value
}

app.post(
  '/api/battle/live/entry/:network',
  (req, res, next) => {
    const normalizedAmount = Number.parseFloat(req.body?.amountDisplay || '12.00')
    const safeAmount = Number.isFinite(normalizedAmount) ? normalizedAmount : 12
    gatewayRequireUsd(safeAmount.toFixed(2))(req, res, next)
  },
  (req, res) => {
    const network = req.params.network === 'mainnet' ? 'mainnet' : 'testnet'
    const { battleId, dancerId } = req.body ?? {}

    if (typeof battleId !== 'string' || typeof dancerId !== 'string') {
      return res.status(400).json({
        error: 'Invalid payload. Expected battleId and dancerId as strings.',
      })
    }

    return res.status(200).json({
      ok: true,
      network,
      battleId,
      dancerId,
      status: 'payment_finalized',
      payment: req.payment ?? null,
    })
  },
)

app.post('/api/battle/live/recover', (req, res) => {
  const { intentId, txHash, battleId, dancerId, amountDisplay, network } = req.body ?? {}
  if (typeof txHash !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected txHash as a string.',
    })
  }

  try {
    let targetIntentId = intentId
    if (typeof targetIntentId !== 'string' || targetIntentId.length === 0) {
      if (typeof battleId !== 'string' || typeof dancerId !== 'string') {
        return res.status(400).json({
          error:
            'Missing intentId. Provide intentId, or provide battleId + dancerId so server can recreate the intent.',
        })
      }
      const recreated = createBattleEntryIntent({ battleId, dancerId, amountDisplay, network })
      targetIntentId = recreated.intentId
    }

    let recovered
    try {
      recovered = recoverBattleEntryPayment({ intentId: targetIntentId, txHash })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (
        message.includes('Battle entry intent not found.') &&
        typeof battleId === 'string' &&
        typeof dancerId === 'string'
      ) {
        const recreated = createBattleEntryIntent({ battleId, dancerId, amountDisplay, network })
        recovered = recoverBattleEntryPayment({ intentId: recreated.intentId, txHash })
      } else {
        throw error
      }
    }
    return res.status(200).json({
      intentId: recovered.intentId,
      status: recovered.status,
      chainId: recovered.chainId,
      recovered: true,
      txHash,
      paymentReceipt: recovered.receipt ? Receipt.serialize(recovered.receipt) : null,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to recover live battle payment.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/battle/live/confirm-and-recover', async (req, res) => {
  const { intentId, txHash, battleId, dancerId, amountDisplay, network } = req.body ?? {}
  const resolvedNetwork = network === 'mainnet' ? 'mainnet' : 'testnet'
  if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    return res.status(400).json({
      error: 'Invalid payload. Expected txHash as 0x-prefixed hash string.',
    })
  }

  try {
    const client = arcPublicClient
    const receipt = await client.getTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') {
      return res.status(409).json({
        error: 'Transaction found but not successful.',
        txHash,
        onchainStatus: receipt.status,
      })
    }

    let targetIntentId = intentId
    if (typeof targetIntentId !== 'string' || targetIntentId.length === 0) {
      if (typeof battleId !== 'string' || typeof dancerId !== 'string') {
        return res.status(400).json({
          error:
            'Missing intentId. Provide intentId, or provide battleId + dancerId so server can recreate the intent.',
        })
      }
      const recreated = createBattleEntryIntent({
        battleId,
        dancerId,
        amountDisplay,
        network: resolvedNetwork,
      })
      targetIntentId = recreated.intentId
    }

    let recovered
    try {
      recovered = recoverBattleEntryPayment({ intentId: targetIntentId, txHash })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (
        message.includes('Battle entry intent not found.') &&
        typeof battleId === 'string' &&
        typeof dancerId === 'string'
      ) {
        const recreated = createBattleEntryIntent({
          battleId,
          dancerId,
          amountDisplay,
          network: resolvedNetwork,
        })
        recovered = recoverBattleEntryPayment({ intentId: recreated.intentId, txHash })
      } else {
        throw error
      }
    }

    return res.status(200).json({
      intentId: recovered.intentId,
      status: recovered.status,
      chainId: recovered.chainId,
      recovered: true,
      txHash,
      paymentReceipt: recovered.receipt ? Receipt.serialize(recovered.receipt) : null,
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(404).json({
      error: 'Transaction not confirmed yet.',
      details,
      txHash,
    })
  }
})

app.post('/api/battle/entry', (req, res) => {
  const { battleId, dancerId, amountDisplay, paymentReceipt, simulatePayment, intentId, network } =
    req.body ?? {}

  if (typeof battleId !== 'string' || typeof dancerId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected battleId and dancerId as strings.',
    })
  }

  try {
    let intent
    if (typeof intentId === 'string' && intentId.length > 0) {
      intent = verifyBattleEntryPayment({
        intentId,
        paymentReceipt: null,
      })
      if (intent.battleId !== battleId || intent.dancerId !== dancerId) {
        return res.status(400).json({ error: 'intentId does not match battleId/dancerId.' })
      }
      const receiptHeader = req.get('payment-receipt')
      let suppliedReceipt = paymentReceipt || receiptHeader
      if (simulatePayment && intent.mode === 'mock' && !suppliedReceipt) {
        suppliedReceipt = createMockReceipt(intent)
      }
      if (typeof suppliedReceipt === 'string' && suppliedReceipt.length > 0) {
        intent = verifyBattleEntryPayment({ intentId, paymentReceipt: suppliedReceipt })
      }
    } else {
      intent = createBattleEntryIntent({ battleId, dancerId, amountDisplay, network })
      const receiptHeader = req.get('payment-receipt')
      let suppliedReceipt = paymentReceipt || receiptHeader
      if (simulatePayment && intent.mode === 'mock' && !suppliedReceipt) {
        suppliedReceipt = createMockReceipt(intent)
      }
      if (typeof suppliedReceipt === 'string' && suppliedReceipt.length > 0) {
        intent = verifyBattleEntryPayment({ intentId: intent.intentId, paymentReceipt: suppliedReceipt })
      }
    }

    return res.status(201).json({
      intentId: intent.intentId,
      status: intent.status,
      mode: intent.mode,
      testnet: intent.testnet,
      chainId: intent.chainId,
      paymentRequest: intent.requestEncoded,
      ...(intent.receipt ? { paymentReceipt: intent.receipt } : {}),
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to create or verify battle entry intent.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/battle/result', (req, res) => {
  const { battleId, winners } = req.body ?? {}
  const hasValidWinners =
    Array.isArray(winners) &&
    winners.length > 0 &&
    winners.every(
      (winner) =>
        winner &&
        typeof winner.dancerId === 'string' &&
        typeof winner.amountDisplay === 'string',
    )

  if (typeof battleId !== 'string' || !hasValidWinners) {
    return res.status(400).json({
      error:
        'Invalid payload. Expected battleId and winners[{ dancerId, amountDisplay }].',
    })
  }

  try {
    const result = finalizeBattleResults({ battleId, winners })
    return res.status(201).json({
      battleId: result.battleId,
      status: 'results_finalized',
      winners: result.winners,
      finalizedAt: result.finalizedAt,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to finalize battle results.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/payout/execute', (req, res) => {
  const { battleId, network } = req.body ?? {}

  if (typeof battleId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected battleId as a string.',
    })
  }

  try {
    const execution = executeBattlePayout({ battleId, network })
    return res.status(201).json({
      battleId: execution.battleId,
      mode: execution.mode,
      status: 'payout_executed',
      executedAt: execution.executedAt,
      payouts: execution.payouts,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to execute payout.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/api/payout/:battleId', (req, res) => {
  const execution = getBattlePayoutExecution(req.params.battleId)
  if (!execution) {
    return res.status(404).json({ error: 'Payout execution not found.' })
  }
  return res.json(execution)
})

app.post('/api/coaching/start', (req, res) => {
  const { coachId, dancerId, ratePerMinute } = req.body ?? {}

  if (typeof coachId !== 'string' || typeof dancerId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected coachId and dancerId as strings.',
    })
  }

  const rate = Number(ratePerMinute ?? '2.5')
  if (!Number.isFinite(rate) || rate <= 0) {
    return res
      .status(400)
      .json({ error: 'Invalid ratePerMinute. Expected positive number.' })
  }

  try {
    const session = startCoachingSession({
      coachId,
      dancerId,
      ratePerMinute: rate,
    })
    return res.status(201).json({
      sessionId: session.id,
      status: session.status,
      ratePerMinute: session.ratePerMinute,
      createdAt: session.createdAt,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to start coaching session.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post(
  '/api/coaching/live/start/:network',
  (req, res, next) => {
    const rate = Number(req.body?.ratePerMinute ?? '2.5')
    const safe = Number.isFinite(rate) && rate > 0 ? rate : 2.5
    gatewayRequireUsd(safe.toFixed(2))(req, res, next)
  },
  (req, res) => {
    const network = req.params.network === 'mainnet' ? 'mainnet' : 'testnet'
    const { coachId, dancerId, ratePerMinute } = req.body ?? {}

    if (typeof coachId !== 'string' || typeof dancerId !== 'string') {
      return res.status(400).json({
        error: 'Invalid payload. Expected coachId and dancerId as strings.',
      })
    }

    const rate = Number(ratePerMinute ?? '2.5')
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(400).json({
        error: 'Invalid ratePerMinute. Expected positive number.',
      })
    }

    const session = startCoachingSession({
      coachId,
      dancerId,
      ratePerMinute: rate,
    })

    return res.status(201).json({
      ok: true,
      network,
      sessionId: session.id,
      status: session.status,
      ratePerMinute: session.ratePerMinute,
      createdAt: session.createdAt,
      payment: req.payment ?? null,
    })
  },
)

app.post('/api/coaching/live/confirm-by-tx', async (req, res) => {
  const { txHash, coachId, dancerId, ratePerMinute, network } = req.body ?? {}
  const resolvedNetwork = network === 'mainnet' ? 'mainnet' : 'testnet'

  if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    return res.status(400).json({
      error: 'Invalid payload. Expected txHash as 0x-prefixed hash string.',
    })
  }
  if (typeof coachId !== 'string' || typeof dancerId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected coachId and dancerId as strings.',
    })
  }

  const rate = Number(ratePerMinute ?? '2.5')
  if (!Number.isFinite(rate) || rate <= 0) {
    return res.status(400).json({
      error: 'Invalid ratePerMinute. Expected positive number.',
    })
  }

  try {
    const client = arcPublicClient
    const onchainReceipt = await client.getTransactionReceipt({ hash: txHash })
    if (onchainReceipt.status !== 'success') {
      return res.status(409).json({
        error: 'Transaction found but not successful.',
        txHash,
        onchainStatus: onchainReceipt.status,
      })
    }

    const recovered = coachingLiveRecoveryByTx.get(txHash)
    if (recovered) {
      return res.status(200).json({ ...recovered, recovered: true, txHash })
    }

    const session = startCoachingSession({
      coachId,
      dancerId,
      ratePerMinute: rate,
    })
    const payload = {
      network: resolvedNetwork,
      sessionId: session.id,
      status: session.status,
      ratePerMinute: session.ratePerMinute,
      createdAt: session.createdAt,
    }
    coachingLiveRecoveryByTx.set(txHash, payload)
    return res.status(200).json({ ...payload, recovered: true, txHash })
  } catch (error) {
    return res.status(404).json({
      error: 'Transaction not confirmed yet.',
      details: error instanceof Error ? error.message : 'Unknown error',
      txHash,
    })
  }
})

app.post('/api/coaching/ping-usage', (req, res) => {
  const { sessionId, seconds } = req.body ?? {}
  const secondsNumber = Number(seconds ?? 30)

  if (typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected sessionId as a string.',
    })
  }

  if (!Number.isFinite(secondsNumber) || secondsNumber <= 0) {
    return res
      .status(400)
      .json({ error: 'Invalid seconds. Expected positive number.' })
  }

  try {
    const session = tickCoachingSession({ sessionId, seconds: secondsNumber })
    return res.json({
      sessionId: session.id,
      status: session.status,
      seconds: session.seconds,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to record coaching usage.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/coaching/end', (req, res) => {
  const { sessionId } = req.body ?? {}

  if (typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected sessionId as a string.',
    })
  }

  try {
    const session = endCoachingSession({ sessionId })
    return res.json({
      sessionId: session.id,
      status: session.status,
      minutes: session.minutes,
      amountDisplay: session.amountDisplay,
      receipt: session.receipt,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to end coaching session.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/api/coaching/:id/receipt', (req, res) => {
  const receipt = getCoachingReceipt(req.params.id)
  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found.' })
  }
  return res.json(receipt)
})

app.post('/api/beats/:id/license-intent', (req, res) => {
  const { id } = req.params
  const { consumerId, amountDisplay } = req.body ?? {}

  if (typeof consumerId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected consumerId as a string.',
    })
  }

  try {
    const license = createBeatLicenseIntent({
      beatId: id,
      consumerId,
      amountDisplay,
    })
    return res.status(201).json({
      licenseId: license.licenseId,
      status: license.status,
      paymentRequest: license.requestEncoded,
      amountDisplay: license.amountDisplay,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to create beat license intent.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post(
  '/api/beats/live/:id/license/:network',
  (req, res, next) => {
    const normalizedAmount = Number.parseFloat(req.body?.amountDisplay || '12.00')
    const safeAmount = Number.isFinite(normalizedAmount) ? normalizedAmount : 12
    gatewayRequireUsd(safeAmount.toFixed(2))(req, res, next)
  },
  (req, res) => {
    const network = req.params.network === 'mainnet' ? 'mainnet' : 'testnet'
    const { id } = req.params
    const { consumerId, amountDisplay } = req.body ?? {}

    if (typeof consumerId !== 'string') {
      return res.status(400).json({
        error: 'Invalid payload. Expected consumerId as a string.',
      })
    }

    const normalizedAmount = Number.parseFloat(amountDisplay || '12.00')
    const safeAmount = Number.isFinite(normalizedAmount) ? normalizedAmount : 12
    const tokenAmount = safeAmount.toFixed(2)

    try {
      const licenseIntent = createBeatLicenseIntent({
        beatId: id,
        consumerId,
        amountDisplay: tokenAmount,
      })
      const license = grantBeatLicense({ licenseId: licenseIntent.licenseId })

      return res.status(200).json({
        ok: true,
        network,
        licenseId: license.licenseId,
        status: license.status,
        streamUrl: license.streamUrl,
        receipt: license.receipt,
        payment: req.payment ?? null,
      })
    } catch (error) {
      return res.status(400).json({
        error: 'Live beat license payment failed.',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  },
)

app.post('/api/beats/live/:id/confirm-by-tx', async (req, res) => {
  const { id } = req.params
  const { txHash, consumerId, amountDisplay, network } = req.body ?? {}
  const resolvedNetwork = network === 'mainnet' ? 'mainnet' : 'testnet'

  if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    return res.status(400).json({
      error: 'Invalid payload. Expected txHash as 0x-prefixed hash string.',
    })
  }
  if (typeof consumerId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected consumerId as a string.',
    })
  }

  const normalizedAmount = Number.parseFloat(amountDisplay || '12.00')
  const safeAmount = Number.isFinite(normalizedAmount) ? normalizedAmount : 12
  const tokenAmount = safeAmount.toFixed(2)
  const recoveryKey = `${resolvedNetwork}:${id}:${txHash}`

  try {
    const client = arcPublicClient
    const onchainReceipt = await client.getTransactionReceipt({ hash: txHash })
    if (onchainReceipt.status !== 'success') {
      return res.status(409).json({
        error: 'Transaction found but not successful.',
        txHash,
        onchainStatus: onchainReceipt.status,
      })
    }

    const recovered = beatsLiveRecoveryByTx.get(recoveryKey)
    if (recovered) {
      return res.status(200).json({ ...recovered, recovered: true, txHash })
    }

    const licenseIntent = createBeatLicenseIntent({
      beatId: id,
      consumerId,
      amountDisplay: tokenAmount,
    })
    const license = grantBeatLicense({ licenseId: licenseIntent.licenseId })
    const payload = {
      network: resolvedNetwork,
      licenseId: license.licenseId,
      status: license.status,
      streamUrl: license.streamUrl,
      receipt: license.receipt,
    }
    beatsLiveRecoveryByTx.set(recoveryKey, payload)
    return res.status(200).json({ ...payload, recovered: true, txHash })
  } catch (error) {
    return res.status(404).json({
      error: 'Transaction not confirmed yet.',
      details: error instanceof Error ? error.message : 'Unknown error',
      txHash,
    })
  }
})

app.post('/api/beats/:id/grant-access', (req, res) => {
  const { id } = req.params
  const { licenseId } = req.body ?? {}

  if (typeof licenseId !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected licenseId as a string.',
    })
  }

  try {
    const license = grantBeatLicense({ licenseId })
    if (license.beatId !== id) {
      return res
        .status(400)
        .json({ error: 'licenseId does not belong to this beat.' })
    }
    return res.json({
      licenseId: license.licenseId,
      status: license.status,
      streamUrl: license.streamUrl,
      receipt: license.receipt,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to grant beat access.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/judges/score', (req, res) => {
  const r = executeDanceExtraFlow('judge-score', req.body ?? {})
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  return res.status(r.status).json(r.result)
})

app.post('/api/cypher/micropot/contribute', (req, res) => {
  const r = executeDanceExtraFlow('cypher-micropot', req.body ?? {})
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  return res.status(r.status).json(r.result)
})

app.post('/api/clips/sale', (req, res) => {
  const r = executeDanceExtraFlow('clip-sale', req.body ?? {})
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  return res.status(r.status).json(r.result)
})

app.post('/api/reputation/attest', (req, res) => {
  const r = executeDanceExtraFlow('reputation', req.body ?? {})
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  return res.status(r.status).json(r.result)
})

app.post('/api/studio/ai-usage', (req, res) => {
  const r = executeDanceExtraFlow('ai-usage', req.body ?? {})
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  return res.status(r.status).json(r.result)
})

app.post('/api/bot/action', (req, res) => {
  const r = executeDanceExtraFlow('bot-action', req.body ?? {})
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  return res.status(r.status).json(r.result)
})

app.post(
  '/api/ops/agentmail/send',
  (req, res, next) => {
    const agentmailApiKey = process.env.AGENTMAIL_API_KEY
    if (typeof agentmailApiKey === 'string' && agentmailApiKey.trim()) {
      const amount = Number.parseFloat(process.env.AGENTMAIL_SEND_FEE || '0.01')
      const safeAmount = Number.isFinite(amount) ? amount : 0.01
      return gatewayRequireUsd(safeAmount.toFixed(2))(req, res, next)
    }
    return next()
  },
  async (req, res) => {
    const { to, subject, text, html, inbox_id } = req.body ?? {}
    const effectiveInboxId = typeof inbox_id === 'string' && inbox_id.trim() ? inbox_id.trim() : process.env.AGENTMAIL_INBOX_ID
    const agentmailApiKey = process.env.AGENTMAIL_API_KEY

    if (typeof to !== 'string' || typeof subject !== 'string') {
      return res.status(400).json({
        error: 'Invalid payload. Expected to and subject as strings.',
      })
    }

    if (typeof effectiveInboxId !== 'string' || !effectiveInboxId.trim()) {
      return res.status(400).json({
        error: 'Missing inbox_id for AgentMail send.',
        details: 'Provide `inbox_id` in request body or set AGENTMAIL_INBOX_ID on the server.',
      })
    }

    // 1) Wallet pays this backend via Circle Gateway x402 (when AGENTMAIL_API_KEY is set).
    // 2) Backend executes AgentMail send via stable API-key endpoint.
    if (typeof agentmailApiKey === 'string' && agentmailApiKey.trim()) {
      try {
        const apiBase = process.env.AGENTMAIL_BASE_URL || 'https://api.agentmail.to'
        const endpoint = `${apiBase.replace(/\/$/, '')}/v0/inboxes/${encodeURIComponent(effectiveInboxId)}/messages/send`
        const upstream = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${agentmailApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to,
            subject,
            ...(typeof text === 'string' ? { text } : {}),
            ...(typeof html === 'string' ? { html } : {}),
          }),
        })

        const raw = await upstream.text()
        let data = null
        try {
          data = raw ? JSON.parse(raw) : null
        } catch {
          data = null
        }

        if (!upstream.ok) {
          return res.status(upstream.status).json({
            error: 'AgentMail send failed.',
            upstreamStatus: upstream.status,
            upstreamEndpoint: endpoint,
            details: data ?? raw,
          })
        }

        return res.status(201).json({
          provider: 'agentmail',
          status: 'sent',
          result: data ?? raw,
          payment: req.payment ?? null,
        })
      } catch (error) {
        return res.status(500).json({
          error: 'AgentMail request failed.',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // No API key available: direct AgentMail passthrough mode.
  const gatewayBase = x402Env.agentmailWalletGatewayBaseUrl()
  const endpoint = `${gatewayBase}/v0/inboxes/${encodeURIComponent(effectiveInboxId)}/messages/send`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Includes `Payment` and `Payment-Receipt` headers when the client
        // successfully solves an x402 challenge via the browser client.
        ...getForwardAuthHeaders(req),
      },
      body: JSON.stringify({
        inbox_id: effectiveInboxId,
        to,
        subject,
        ...(typeof text === 'string' ? { text } : {}),
        ...(typeof html === 'string' ? { html } : {}),
      }),
    })

    // Preserve x402 challenge headers on 402 so the browser client can solve and retry.
    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'AgentMail send failed.',
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        details: data ?? raw,
      })
    }
    return res.status(201).json({
      provider: 'agentmail',
      status: 'sent',
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'AgentMail request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Create an AgentMail inbox using wallet-paid (x402).
// The browser pays upstream and forwards the resulting Payment headers to this route.
app.post('/api/ops/agentmail/inbox/create', async (req, res) => {
  const { username, domain, display_name, client_id } = req.body ?? {}
  const gatewayBase = x402Env.agentmailWalletGatewayBaseUrl()
  const endpoint = `${gatewayBase}/v0/inboxes`
  const agentmailApiKey = process.env.AGENTMAIL_API_KEY

  // AgentMail can auto-generate an inbox if `username` is omitted.
  // Validate only that provided fields are strings.
  const providedTypesOk =
    (typeof username === 'undefined' || typeof username === 'string') &&
    (typeof domain === 'undefined' || typeof domain === 'string') &&
    (typeof display_name === 'undefined' || typeof display_name === 'string') &&
    (typeof client_id === 'undefined' || typeof client_id === 'string')
  if (!providedTypesOk) {
    return res.status(400).json({
      error: 'Invalid payload for AgentMail inbox create.',
      details: 'Expected `username`, `domain`, `display_name`, and `client_id` as strings when provided.',
    })
  }

  const payload = {}
  if (typeof username === 'string' && username.trim()) payload.username = username.trim()
  if (typeof domain === 'string' && domain.trim()) payload.domain = domain.trim()
  if (typeof display_name === 'string' && display_name.trim()) payload.display_name = display_name.trim()
  if (typeof client_id === 'string' && client_id.trim()) payload.client_id = client_id.trim()

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof agentmailApiKey === 'string' && agentmailApiKey.trim()
          ? { Authorization: `Bearer ${agentmailApiKey.trim()}` }
          : {}),
        ...getForwardAuthHeaders(req), // includes `payment` and `payment-receipt` when solved
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'AgentMail inbox create failed.',
        details: data ?? raw,
      })
    }

    return res.status(200).json({
      provider: 'agentmail',
      status: 'created',
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'AgentMail inbox create request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/fan-pass/purchase', (req, res) => {
  const r = executeDanceExtraFlow('fan-pass', req.body ?? {})
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  return res.status(r.status).json(r.result)
})

/** GET — verify this server build exposes live dance-extras (useful when debugging 404 from stale `npm run server`). */
app.get('/api/dance-extras/live', (_req, res) => {
  res.json({
    ok: true,
    method: 'POST',
    path: '/api/dance-extras/live/:flowKey/:network',
    flowKeys: Object.keys(DANCE_EXTRA_LIVE_AMOUNTS),
    networks: ['testnet', 'mainnet'],
  })
})

/**
 * Wallet-paid Circle Gateway x402 for the seven HealthTech “extra” flows — charges then runs the same scaffold as mock routes.
 * Body: same JSON as the corresponding `/api/...` route; `network` in the URL overrides body for chain selection (Arc Testnet).
 */
app.post(
  '/api/dance-extras/live/:flowKey/:networkParam',
  (req, res, next) => {
    const flowKey = req.params.flowKey
    const amount = DANCE_EXTRA_LIVE_AMOUNTS[flowKey]
    if (!amount) {
      return res.status(400).json({ error: 'Invalid flowKey for live x402.' })
    }
    gatewayRequireUsd(amount)(req, res, next)
  },
  (req, res) => {
    const network = req.params.networkParam === 'mainnet' ? 'mainnet' : 'testnet'
    const flowKey = req.params.flowKey
    const body = { ...(req.body ?? {}), network }
    const r = executeDanceExtraFlow(flowKey, body)
    if (!r.ok) {
      return res.status(r.status).json({ error: r.error })
    }
    return res.status(r.status).json({ ...r.result, livePayment: true, payment: req.payment ?? null })
  },
)

app.post('/api/travel/stable/flights-search', async (req, res) => {
  const { originLocationCode, destinationLocationCode, departureDate, adults, max } = req.body ?? {}

  if (
    typeof originLocationCode !== 'string' ||
    typeof destinationLocationCode !== 'string' ||
    typeof departureDate !== 'string'
  ) {
    return res.status(400).json({
      error:
        'Invalid payload. Expected originLocationCode, destinationLocationCode, departureDate as strings.',
    })
  }

  const search = new URLSearchParams({
    originLocationCode,
    destinationLocationCode,
    departureDate,
    adults: String(Number.isFinite(Number(adults)) ? Number(adults) : 1),
    max: String(Number.isFinite(Number(max)) ? Number(max) : 5),
  })

  const url = `https://stabletravel.dev/api/flights/search?${search.toString()}`

  try {
    // Forward/x402 payment headers from the client POST so paid retries succeed.
    const forwardHeaders = getForwardAuthHeaders(req)
    const response = await fetch(url, { method: 'GET', headers: forwardHeaders })
    // StableTravel uses x402/ Preserve upstream `402` challenge so the frontend
    // can solve it via x402 (browser wallet flow).
    if (response.status === 402) return sendFetchResponse(res, response)

    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'StableTravel request failed.',
        details: data ?? text,
        endpoint: url,
      })
    }

    return res.json({
      provider: 'stabletravel',
      endpoint: url,
      result: data ?? text,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'StableTravel integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/travel/aviationstack/flights', async (req, res) => {
  const { flight_iata, dep_iata, arr_iata, flight_status, limit } = req.body ?? {}
  const apiKey = process.env.AVIATIONSTACK_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'AVIATIONSTACK_API_KEY is not set on the server.',
    })
  }

  const baseUrl = process.env.AVIATIONSTACK_BASE_URL || 'http://api.aviationstack.com/v1'
  const endpoint = `${baseUrl.replace(/\/$/, '')}/flights`
  const params = new URLSearchParams({ access_key: apiKey })
  if (typeof flight_iata === 'string' && flight_iata.trim()) params.set('flight_iata', flight_iata)
  if (typeof dep_iata === 'string' && dep_iata.trim()) params.set('dep_iata', dep_iata)
  if (typeof arr_iata === 'string' && arr_iata.trim()) params.set('arr_iata', arr_iata)
  if (typeof flight_status === 'string' && flight_status.trim()) {
    params.set('flight_status', flight_status)
  }
  if (Number.isFinite(Number(limit))) params.set('limit', String(Number(limit)))
  const url = `${endpoint}?${params.toString()}`

  try {
    const response = await fetch(url, { method: 'GET' })
    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Aviationstack request failed.',
        details: data ?? raw,
      })
    }
    return res.json({
      provider: 'aviationstack',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Aviationstack integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/travel/googlemaps/geocode', async (req, res) => {
  const { address, language, region } = req.body ?? {}
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'GOOGLE_MAPS_API_KEY is not set on the server.',
    })
  }

  if (typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({
      error: 'Invalid payload. Expected address as a non-empty string.',
    })
  }

  const baseUrl = process.env.GOOGLE_MAPS_BASE_URL || 'https://maps.googleapis.com/maps/api'
  const endpoint = `${baseUrl.replace(/\/$/, '')}/geocode/json`
  const params = new URLSearchParams({
    key: apiKey,
    address: address.trim(),
  })
  if (typeof language === 'string' && language.trim()) params.set('language', language.trim())
  if (typeof region === 'string' && region.trim()) params.set('region', region.trim())
  const url = `${endpoint}?${params.toString()}`

  try {
    const response = await fetch(url, { method: 'GET' })
    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Google Maps request failed.',
        details: data ?? raw,
      })
    }
    return res.json({
      provider: 'google-maps',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Google Maps integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

let warnedLegacyOpenWeatherPath = false
function resolveOpenWeatherCurrentPath() {
  const raw = process.env.OPENWEATHER_CURRENT_PATH || '/openweather/current-weather'
  const normalized = raw.startsWith('/') ? raw : `/${raw}`
  // catalog: POST /openweather/current-weather (not legacy OpenWeather GET /data/2.5/weather).
  if (normalized === '/data/2.5/weather') {
    if (!warnedLegacyOpenWeatherPath) {
      warnedLegacyOpenWeatherPath = true
      console.warn(
        '[openweather] OPENWEATHER_CURRENT_PATH=/data/2.5/weather is not valid on weather.mpp.paywithlocus.com — using /openweather/current-weather. Update .env.',
      )
    }
    return '/openweather/current-weather'
  }
  return normalized
}

app.post('/api/travel/openweather/current', async (req, res) => {
  const { lat, lon, units } = req.body ?? {}
  const apiKey = process.env.OPENWEATHER_API_KEY

  const latNum = Number(lat)
  const lonNum = Number(lon)
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return res.status(400).json({
      error: 'Invalid payload. Expected lat and lon as numbers.',
    })
  }

  const baseUrl = process.env.OPENWEATHER_BASE_URL || 'https://weather.mpp.paywithlocus.com'
  const weatherPath = resolveOpenWeatherCurrentPath()
  const endpoint = `${baseUrl.replace(/\/$/, '')}${weatherPath.startsWith('/') ? weatherPath : `/${weatherPath}`}`

  const payload = {
    lat: latNum,
    lon: lonNum,
  }
  if (typeof units === 'string' && units.trim()) payload.units = units.trim()
  if (typeof apiKey === 'string' && apiKey.trim()) payload.appid = apiKey.trim()

  try {
    const forwardHeaders = getForwardAuthHeaders(req)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardHeaders,
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'OpenWeather request failed.',
        details: data ?? raw,
        upstreamEndpoint: endpoint,
        hint:
          !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
            ? 'Connect wallet on mainnet and complete payment (x402), or set OPENWEATHER_API_KEY on the server.'
            : undefined,
      })
    }

    return res.status(response.status).json({
      provider: 'openweather',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'OpenWeather integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/market/kicksdb/search', async (req, res) => {
  const { query, market, per_page } = req.body ?? {}
  const apiKey = process.env.KICKSDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'KICKSDB_API_KEY is not set on the server.',
    })
  }

  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({
      error: 'Invalid payload. Expected query as a non-empty string.',
    })
  }

  const baseUrl = process.env.KICKSDB_BASE_URL || 'https://kicksdb.mpp.tempo.xyz'
  const searchPath = process.env.KICKSDB_SEARCH_PATH || '/v3/stockx/products'
  const endpoint = `${baseUrl.replace(/\/$/, '')}${searchPath.startsWith('/') ? searchPath : `/${searchPath}`}`

  const params = new URLSearchParams({ query: query.trim() })
  if (typeof market === 'string' && market.trim()) params.set('market', market.trim().toUpperCase())
  if (Number.isFinite(Number(per_page))) params.set('per_page', String(Number(per_page)))
  const url = `${endpoint}?${params.toString()}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Forward payment headers when the client uses an-capable flow (x402).
        ...getForwardAuthHeaders(req),
      },
    })

    // Preserve x402 challenge headers on 402 so wallet x402 client can solve and retry.
    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'KicksDB request failed.',
        details: data ?? raw,
      })
    }

    return res.json({
      provider: 'kicksdb',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'KicksDB integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/** Suno catalog uses POST /suno/generate-music (not /api/generate). */
let warnedLegacySunoGeneratePath = false
function resolveSunoGeneratePath() {
  const raw = process.env.SUNO_GENERATE_PATH || '/suno/generate-music'
  const normalized = raw.startsWith('/') ? raw : `/${raw}`
  if (normalized === '/api/generate') {
    if (!warnedLegacySunoGeneratePath) {
      warnedLegacySunoGeneratePath = true
      console.warn(
        '[suno] SUNO_GENERATE_PATH=/api/generate is not valid on suno.mpp.paywithlocus.com — using /suno/generate-music. Update .env and restart.',
      )
    }
    return '/suno/generate-music'
  }
  return normalized
}

const SUNO_GENERATE_MODELS = new Set(['V4', 'V4_5', 'V4_5ALL', 'V4_5PLUS', 'V5'])

app.post('/api/music/suno/generate', async (req, res) => {
  const { prompt, style, duration, customMode, instrumental, model } = req.body ?? {}

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({
      error: 'Invalid payload. Expected prompt as a non-empty string.',
    })
  }

  /** Suno `generate-music` requires this flag (simple prompt vs custom lyrics/style flow). */
  const customModeBool = typeof customMode === 'boolean' ? customMode : false
  /** true = no vocals / instrumental track (Suno API requires the boolean). */
  const instrumentalBool = typeof instrumental === 'boolean' ? instrumental : false
  /** Upstream: model is required — must be one of V4, V4_5, … */
  const modelTrim = typeof model === 'string' ? model.trim() : ''
  const modelResolved = SUNO_GENERATE_MODELS.has(modelTrim) ? modelTrim : 'V5'

  const baseUrl = process.env.SUNO_BASE_URL || 'https://suno.mpp.paywithlocus.com'
  const generatePath = resolveSunoGeneratePath()
  const endpoint = `${baseUrl.replace(/\/$/, '')}${generatePath.startsWith('/') ? generatePath : `/${generatePath}`}`

  try {
    const forwardHeaders = getForwardAuthHeaders(req)
    const headers = {
      'Content-Type': 'application/json',
      ...forwardHeaders,
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: prompt.trim(),
        customMode: customModeBool,
        instrumental: instrumentalBool,
        model: modelResolved,
        ...(typeof style === 'string' && style.trim() ? { style: style.trim() } : {}),
        ...(Number.isFinite(Number(duration)) ? { duration: Number(duration) } : {}),
      }),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Suno request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint:
          !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
            ? 'Connect wallet on mainnet and complete payment (x402) when prompted.'
            : undefined,
      })
    }

    return res.status(response.status).json({
      provider: 'suno',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Suno integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

function parallelUpstreamBase() {
  return (process.env.PARALLEL_BASE_URL || 'https://parallelmpp.dev').replace(/\/$/, '')
}

/**
 * Parallel (web search / extract / task) via — https://parallelmpp.dev
 * Paid POSTs return 402 until wallet pays; GET task poll is free upstream.
 */
async function proxyParallelRequest(req, res, { path: upstreamPath, method = 'POST', jsonBody }) {
  const endpoint = `${parallelUpstreamBase()}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}`
  try {
    const forwardHeaders = getForwardAuthHeaders(req)
    const headers = {
      ...forwardHeaders,
    }
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(endpoint, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(jsonBody ?? {}),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Parallel request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint:
          method !== 'GET' && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
            ? 'Connect wallet on mainnet and complete payment (x402) when prompted.'
            : undefined,
      })
    }

    return res.status(response.status).json({
      provider: 'parallel',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Parallel integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.post('/api/parallel/search', (req, res) =>
  proxyParallelRequest(req, res, { path: '/api/search', method: 'POST', jsonBody: req.body ?? {} }),
)

app.post('/api/parallel/extract', (req, res) =>
  proxyParallelRequest(req, res, { path: '/api/extract', method: 'POST', jsonBody: req.body ?? {} }),
)

app.post('/api/parallel/task', (req, res) =>
  proxyParallelRequest(req, res, { path: '/api/task', method: 'POST', jsonBody: req.body ?? {} }),
)

app.get('/api/parallel/task/:runId', (req, res) => {
  const runId = encodeURIComponent(String(req.params.runId ?? ''))
  return proxyParallelRequest(req, res, { path: `/api/task/${runId}`, method: 'GET', jsonBody: null })
})

app.post('/api/ops/stablephone/call', async (req, res) => {
  const { phone_number, task, voice } = req.body ?? {}

  if (typeof phone_number !== 'string' || typeof task !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload. Expected phone_number and task as strings.',
    })
  }

  const baseUrl = process.env.STABLEPHONE_BASE_URL || 'https://stablephone.dev'
  const callPath = process.env.STABLEPHONE_CALL_PATH || '/api/call'
  const endpoint = `${baseUrl.replace(/\/$/, '')}${callPath.startsWith('/') ? callPath : `/${callPath}`}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getForwardAuthHeaders(req),
      },
      body: JSON.stringify({
        phone_number,
        task,
        ...(typeof voice === 'string' && voice.trim() ? { voice: voice.trim() } : {}),
      }),
    })

    // Preserve x402 challenge for x402 client (same pattern as StableTravel / AgentMail).
    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'StablePhone call request failed.',
        details: data ?? raw,
      })
    }

    return res.status(201).json({
      provider: 'stablephone',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'StablePhone integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/api/ops/stablephone/call/:id', async (req, res) => {
  const callId = req.params.id
  if (typeof callId !== 'string' || !callId.trim()) {
    return res.status(400).json({ error: 'Invalid call id.' })
  }

  const baseUrl = process.env.STABLEPHONE_BASE_URL || 'https://stablephone.dev'
  const statusPath = process.env.STABLEPHONE_STATUS_PATH || '/api/call'
  const endpoint = `${baseUrl.replace(/\/$/, '')}${statusPath.startsWith('/') ? statusPath : `/${statusPath}`}/${encodeURIComponent(callId)}`

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        ...getForwardAuthHeaders(req),
      },
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'StablePhone status request failed.',
        details: data ?? raw,
      })
    }

    return res.json({
      provider: 'stablephone',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'StablePhone status integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/social/stablesocial/instagram-profile', async (req, res) => {
  // StableSocial OpenAPI: POST /api/instagram/profile expects `{ "handle": "..." }` (not `username`).
  const { username, handle } = req.body ?? {}
  const trimmedHandle =
    typeof handle === 'string' && handle.trim()
      ? handle.trim()
      : typeof username === 'string' && username.trim()
        ? username.trim()
        : ''
  if (!trimmedHandle) {
    return res.status(400).json({
      error: 'Invalid payload. Expected `handle` or `username` as a non-empty string.',
    })
  }

  const baseUrl = process.env.STABLESOCIAL_BASE_URL || 'https://stablesocial.dev'
  const profilePath =
    process.env.STABLESOCIAL_INSTAGRAM_PROFILE_PATH || '/api/instagram/profile'
  const endpoint = `${baseUrl.replace(/\/$/, '')}${profilePath.startsWith('/') ? profilePath : `/${profilePath}`}`

  try {
    const forwardHeaders = getForwardAuthHeaders(req)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardHeaders,
      },
      body: JSON.stringify({ handle: trimmedHandle }),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'StableSocial request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
      })
    }

    return res.status(response.status).json({
      provider: 'stablesocial',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'StableSocial integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/api/social/stablesocial/jobs', async (req, res) => {
  const token = req.query.token
  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({
      error: 'Missing token query parameter.',
    })
  }

  const baseUrl = process.env.STABLESOCIAL_BASE_URL || 'https://stablesocial.dev'
  const jobsPath = process.env.STABLESOCIAL_JOBS_PATH || '/api/jobs'
  const endpoint = `${baseUrl.replace(/\/$/, '')}${jobsPath.startsWith('/') ? jobsPath : `/${jobsPath}`}`
  const url = `${endpoint}?${new URLSearchParams({ token }).toString()}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...getForwardAuthHeaders(req),
      },
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      const hints = []
      if (response.status === 401 || response.status === 403) {
        hints.push('SIWX must be from the same wallet that paid for the job token.')
      }
      // https://stablesocial.dev/llms.txt — "502 — Upstream data collection failed"
      if (response.status === 502) {
        hints.push(
          'StableSocial reports upstream data collection failed — retry poll later or trigger a new job.',
        )
      }
      return res.status(response.status).json({
        error: 'StableSocial jobs poll failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: url,
        hint: hints.length ? hints.join(' ') : undefined,
      })
    }

    return res.json({
      provider: 'stablesocial',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'StableSocial jobs integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post(
  '/api/card/create',
  (req, res, next) => {
    const providerMode = (process.env.CARD_PROVIDER || 'laso').toLowerCase()
    const useLaso = providerMode === 'laso'
    if (!useLaso) return next()
    const normalizedAmount = Number.parseFloat(req.body?.amountDisplay || '5.00')
    const safeAmount = Number.isFinite(normalizedAmount) ? normalizedAmount : 5
    return gatewayRequireUsd(safeAmount.toFixed(2))(req, res, next)
  },
  async (req, res) => {
    const { walletAddress, amountDisplay, currency, label } = req.body ?? {}

    if (typeof walletAddress !== 'string' || !walletAddress.startsWith('0x')) {
      return res.status(400).json({
        error: 'Invalid payload. Expected walletAddress as 0x-prefixed string.',
      })
    }

    const providerMode = (process.env.CARD_PROVIDER || 'laso').toLowerCase()
    const useLaso = providerMode === 'laso'

    const respondWithMock = () => {
      try {
        const card = createVirtualDebitCard({ walletAddress, amountDisplay, currency, label })
        return res.status(201).json({
          cardId: card.cardId,
          brand: card.brand,
          provider: card.provider,
          cardNumber: card.cardNumber,
          expiry: card.expiry,
          cvv: card.cvv,
          amountDisplay: card.amountDisplay,
          currency: card.currency,
          status: card.status,
          label: card.label,
          createdAt: card.createdAt,
          receipt: card.receipt,
        })
      } catch (error) {
        return res.status(400).json({
          error: 'Failed to create virtual debit card.',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

  const respondWithMockDemo = (demoReason) => {
    try {
      const card = createVirtualDebitCard({ walletAddress, amountDisplay, currency, label })
      lasoCardDemoReasonById.set(card.cardId, demoReason)
      return res.status(201).json({
        cardId: card.cardId,
        brand: card.brand,
        provider: card.provider,
        cardNumber: card.cardNumber,
        expiry: card.expiry,
        cvv: card.cvv,
        amountDisplay: card.amountDisplay,
        currency: card.currency,
        status: card.status,
        label: card.label,
        createdAt: card.createdAt,
        receipt: card.receipt,
        demo: true,
        demoReason,
      })
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to create virtual debit card.',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const isUsOnlyBlocked = (raw) => {
    const s = String(raw ?? '').toLowerCase()
    return (
      s.includes('us only') ||
      s.includes('united states') ||
      (s.includes('restricted') && s.includes('region')) ||
      (s.includes('not available') && (s.includes('us') || s.includes('united')))
    )
  }

  if (!useLaso) return respondWithMock()

  const normalizedAmount = Number.parseFloat(amountDisplay || '5.00')
  const safeAmount = Number.isFinite(normalizedAmount) ? normalizedAmount : 5

  try {
    const lasoBase = process.env.LASO_BASE_URL || 'https://laso.mpp.paywithlocus.com'
    const lasoPath = x402Env.lasoCardPath()
    const lasoEndpoint = `${lasoBase.replace(/\/$/, '')}${lasoPath.startsWith('/') ? lasoPath : `/${lasoPath}`}`

    const lasoRequestBody = JSON.stringify({ amount: safeAmount, format: 'json' })
    const lasoHeaders = {
      'Content-Type': 'application/json',
      ...getForwardAuthHeaders(req), // includes `payment` and `payment-receipt` when succeeded
    }

    let upstream = await fetch(lasoEndpoint, {
      method: 'POST',
      headers: lasoHeaders,
      body: lasoRequestBody,
    })

    let raw = await upstream.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    // Geo restricted (e.g. UK): avoid charging if Laso tells us it's US-only.
    const usOnlyCheck = data ? JSON.stringify(data) : raw
    if ((upstream.status === 403 || upstream.status === 400) && isUsOnlyBlocked(usOnlyCheck)) {
      return respondWithMockDemo('Demo mode: Laso prepaid card ordering is restricted to the United States (US only).')
    }

    if (upstream.status !== 402 && !upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Laso virtual card request failed.',
        details: data ?? raw,
        endpoint: lasoEndpoint,
        upstreamStatus: upstream.status,
      })
    }

    if (upstream.status === 402) {
      return sendFetchResponse(res, upstream)
    }

    const cardData = data?.card || data?.result?.card || data?.result || data
    const auth = data?.auth || data?.authentication || {}
    const orderedCardId = cardData?.card_id || cardData?.cardId || cardData?.id || ''
    const idToken = auth?.id_token || auth?.idToken || ''
    const refreshToken = auth?.refresh_token || auth?.refreshToken || ''

    if (orderedCardId && idToken && refreshToken) {
      lasoCardAuthById.set(orderedCardId, { idToken, refreshToken })
    }

    const cardStatus = cardData?.status || 'pending'
    const payload = {
      provider: 'laso',
      source: 'laso-x402-gateway',
      cardId: orderedCardId,
      brand: 'Visa',
      // /get-card returns pending card orders initially; poll /get-card-data for details.
      cardNumber: '',
      expiry: '',
      cvv: '',
      amountDisplay: safeAmount.toFixed(2),
      currency: 'USD',
      status: cardStatus === 'ready' ? 'ready' : 'idle',
      label: label || '',
      createdAt: new Date().toISOString(),
      receipt: null,
      raw: data ?? raw,
      payment: req.payment ?? null,
    }

    return res.status(201).json(payload)
  } catch (error) {
    return res.status(400).json({
      error: 'Virtual card payment failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  },
)

app.get('/api/card/:id', async (req, res) => {
  const providerMode = (process.env.CARD_PROVIDER || 'laso').toLowerCase()
  const useLaso = providerMode === 'laso'

  if (!useLaso) {
    const card = getVirtualDebitCard(req.params.id)
    if (!card) return res.status(404).json({ error: 'Virtual card not found.' })
    return res.json(card)
  }

  const cardId = req.params.id
  if (typeof cardId !== 'string' || cardId.length === 0) {
    return res.status(400).json({ error: 'Invalid card id.' })
  }

  const lasoBase = process.env.LASO_BASE_URL || 'https://laso.mpp.paywithlocus.com'
  const statusPath = process.env.LASO_CARD_STATUS_PATH || '/get-card-data'
  const lasoEndpoint = `${lasoBase.replace(/\/$/, '')}${statusPath.startsWith('/') ? statusPath : `/${statusPath}`}`

  const authEntry = lasoCardAuthById.get(cardId)
  if (!authEntry?.idToken || !authEntry?.refreshToken) {
    // Demo fallback: if we already served a mock card (e.g. Laso US-only geo restriction),
    // we should still be able to poll and return the stored mock telemetry.
    const mock = getVirtualDebitCard(cardId)
    if (mock) {
      const demoReason = lasoCardDemoReasonById.get(cardId)
      return res.json({
        ...mock,
        provider: 'laso',
        source: 'laso-x402-gateway',
        demo: true,
        demoReason,
      })
    }

    return res.status(400).json({
      error: 'Missing Laso auth tokens for this cardId.',
      details: 'Create the card first so we can store id_token/refresh_token for polling.',
      cardId,
    })
  }

  const callGetCardData = async (idToken) => {
    const upstream = await fetch(lasoEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        ...getForwardAuthHeaders(req),
      },
      body: JSON.stringify({ card_id: cardId, format: 'json' }),
    })

    const raw = await upstream.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    return { upstream, raw, data }
  }

  try {
    let { upstream, raw, data } = await callGetCardData(authEntry.idToken)

    if (upstream.status === 401) {
      // Refresh id_token when it expires.
      const refreshEndpoint = `${lasoBase.replace(/\/$/, '')}/auth`
      const refreshRes = await fetch(refreshEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: authEntry.refreshToken,
        }),
      })
      const refreshRaw = await refreshRes.text()
      let refreshData = null
      try {
        refreshData = refreshRaw ? JSON.parse(refreshRaw) : null
      } catch {
        refreshData = null
      }

      if (!refreshRes.ok) {
        return res.status(refreshRes.status).json({
          error: 'Laso auth refresh failed while polling card data.',
          details: refreshData ?? refreshRaw,
        })
      }

      const newIdToken = refreshData?.id_token || refreshData?.idToken || ''
      const newRefreshToken = refreshData?.refresh_token || refreshData?.refreshToken || authEntry.refreshToken
      if (!newIdToken) {
        return res.status(401).json({
          error: 'Laso auth refresh returned no id_token.',
          details: refreshData ?? refreshRaw,
        })
      }

      lasoCardAuthById.set(cardId, {
        idToken: newIdToken,
        refreshToken: newRefreshToken,
      })

      ;({ upstream, raw, data } = await callGetCardData(newIdToken))
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Laso card status request failed.',
        details: data ?? raw,
        endpoint: lasoEndpoint,
      })
    }

    const cardData = data
    const details = cardData?.card_details || {}
    const expMonth = details?.exp_month || ''
    const expYear = details?.exp_year || ''
    const expiry =
      expMonth && expYear
        ? `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}`
        : cardData?.expiry || ''

    return res.json({
      provider: 'laso',
      source: 'laso-x402-gateway',
      cardId: cardData?.card_id || cardData?.cardId || cardId,
      status: cardData?.status || 'unknown',
      cardNumber: details?.card_number || '',
      expiry,
      cvv: details?.cvv || '',
      balance: details?.available_balance ?? null,
      receipt: null,
      raw: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Laso card status integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

function openAiGatewayBaseUrl() {
  return x402Env.openAiX402GatewayUrl()
}

function openAiGatewayAuthHeaders(req) {
  const apiKey = process.env.OPENAI_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  const headers = { ...forwardHeaders }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function openAiGatewayPaymentHint(req) {
  const apiKey = process.env.OPENAI_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  return !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
    ? 'Pay upstream x402 with your wallet (Arc Testnet + Circle Gateway in this app), or set OPENAI_API_KEY on the server.'
    : undefined
}

/**
 * OpenAI JSON POST proxy (chat, images, …).
 * @see upstream gateway URL in OPENAI_X402_GATEWAY_URL
 */
async function proxyOpenAiGatewayJson(req, res, upstreamPath, jsonBody) {
  const endpoint = `${openAiGatewayBaseUrl()}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}`
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...openAiGatewayAuthHeaders(req),
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonBody ?? {}),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'OpenAI request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint: openAiGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'openai-x402-gateway',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'OpenAI integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.post('/api/openai/chat/completions', (req, res) =>
  proxyOpenAiGatewayJson(req, res, '/v1/chat/completions', req.body ?? {}),
)

app.post('/api/openai/images/generations', (req, res) =>
  proxyOpenAiGatewayJson(req, res, '/v1/images/generations', req.body ?? {}),
)

/** Text-to-speech — upstream returns audio bytes; we wrap as base64 JSON for the browser. */
app.post('/api/openai/audio/speech', async (req, res) => {
  const endpoint = `${openAiGatewayBaseUrl()}/v1/audio/speech`
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...openAiGatewayAuthHeaders(req),
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body ?? {}),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const buf = Buffer.from(await response.arrayBuffer())
    const ct = response.headers.get('content-type') || ''

    if (!response.ok) {
      let details = buf.toString('utf8')
      try {
        details = JSON.parse(details)
      } catch {
        /* keep string */
      }
      return res.status(response.status).json({
        error: 'OpenAI speech request failed.',
        details,
        upstreamEndpoint: endpoint,
        hint: openAiGatewayPaymentHint(req),
      })
    }

    if (ct.includes('application/json')) {
      let data = null
      try {
        data = JSON.parse(buf.toString('utf8'))
      } catch {
        data = buf.toString('utf8')
      }
      return res.status(200).json({
        provider: 'openai-x402-gateway',
        endpoint,
        result: data,
      })
    }

    const mime = ct.split(';')[0].trim() || 'audio/mpeg'
    return res.status(200).json({
      provider: 'openai-x402-gateway',
      endpoint,
      result: {
        mime,
        audio_base64: buf.toString('base64'),
      },
    })
  } catch (error) {
    return res.status(500).json({
      error: 'OpenAI speech integration failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/** Whisper transcription — multipart file field `file` + `model`. */
app.post('/api/openai/audio/transcriptions', openAiGatewayUpload.single('file'), async (req, res) => {
  const endpoint = `${openAiGatewayBaseUrl()}/v1/audio/transcriptions`
  const file = req.file
  const model = typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : 'whisper-1'

  if (!file?.buffer) {
    return res.status(400).json({
      error: 'Missing audio file. Send multipart/form-data with field "file".',
    })
  }

  try {
    const form = new FormData()
    form.append('file', new Blob([file.buffer]), file.originalname || 'audio.webm')
    form.append('model', model)

    const headers = openAiGatewayAuthHeaders(req)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form,
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'OpenAI transcription request failed.',
        details: data ?? raw,
        upstreamEndpoint: endpoint,
        hint: openAiGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'openai-x402-gateway',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'OpenAI transcription integration failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

function anthropicGatewayBaseUrl() {
  return x402Env.anthropicX402GatewayUrl()
}

/** Anthropic-native headers; still uses Payment / Payment-Receipt from the browser when no key. */
function anthropicGatewayAuthHeaders(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  const headers = { ...forwardHeaders }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    headers['x-api-key'] = apiKey.trim()
    headers['anthropic-version'] = process.env.ANTHROPIC_API_VERSION?.trim() || '2023-06-01'
  }
  return headers
}

function anthropicGatewayPaymentHint(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  return !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
    ? 'Connect wallet on mainnet and complete payment (x402), or set ANTHROPIC_API_KEY on the server.'
    : undefined
}

/**
 * Anthropic JSON POST proxy (Messages API + OpenAI-compatible chat).
 * @see ANTHROPIC_X402_GATEWAY_URL
 */
async function proxyAnthropicGatewayJson(req, res, upstreamPath, jsonBody) {
  const endpoint = `${anthropicGatewayBaseUrl()}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}`
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...anthropicGatewayAuthHeaders(req),
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonBody ?? {}),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Anthropic request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint: anthropicGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'anthropic-x402-gateway',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Anthropic integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.post('/api/anthropic/v1/messages', (req, res) =>
  proxyAnthropicGatewayJson(req, res, '/v1/messages', req.body ?? {}),
)

app.post('/api/anthropic/v1/chat/completions', (req, res) =>
  proxyAnthropicGatewayJson(req, res, '/v1/chat/completions', req.body ?? {}),
)

function openRouterGatewayBaseUrl() {
  return x402Env.openRouterX402GatewayUrl()
}

/** OpenRouter uses Bearer auth; forward payment headers from the browser when no key. */
function openRouterGatewayAuthHeaders(req) {
  const apiKey = process.env.OPENROUTER_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  const headers = { ...forwardHeaders }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function openRouterGatewayPaymentHint(req) {
  const apiKey = process.env.OPENROUTER_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  return !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
    ? 'Connect wallet on mainnet and complete payment (x402), or set OPENROUTER_API_KEY on the server.'
    : undefined
}

/**
 * OpenRouter JSON POST proxy (OpenAI-compatible chat).
 * @see OPENROUTER_X402_GATEWAY_URL
 */
async function proxyOpenRouterGatewayJson(req, res, upstreamPath, jsonBody) {
  const endpoint = `${openRouterGatewayBaseUrl()}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}`
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...openRouterGatewayAuthHeaders(req),
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonBody ?? {}),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'OpenRouter request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint: openRouterGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'openrouter-x402-gateway',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'OpenRouter integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.post('/api/openrouter/v1/chat/completions', (req, res) =>
  proxyOpenRouterGatewayJson(req, res, '/v1/chat/completions', req.body ?? {}),
)

function perplexityGatewayBaseUrl() {
  return x402Env.perplexityX402GatewayUrl()
}

/** Perplexity uses Bearer auth; forward payment headers from the browser when no key. */
function perplexityGatewayAuthHeaders(req) {
  const apiKey = process.env.PERPLEXITY_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  const headers = { ...forwardHeaders }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function perplexityGatewayPaymentHint(req) {
  const apiKey = process.env.PERPLEXITY_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  return !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
    ? 'Connect wallet on mainnet and complete payment (x402), or set PERPLEXITY_API_KEY on the server.'
    : undefined
}

/**
 * Perplexity JSON POST proxy (chat, search, embeddings).
 * @see PERPLEXITY_X402_GATEWAY_URL
 */
async function proxyPerplexityGatewayJson(req, res, upstreamPath, jsonBody) {
  const endpoint = `${perplexityGatewayBaseUrl()}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}`
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...perplexityGatewayAuthHeaders(req),
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonBody ?? {}),
    })

    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Perplexity request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint: perplexityGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'perplexity-x402-gateway',
      endpoint,
      result: data ?? raw,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Perplexity integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.post('/api/perplexity/chat', (req, res) =>
  proxyPerplexityGatewayJson(req, res, '/perplexity/chat', req.body ?? {}),
)

app.post('/api/perplexity/search', (req, res) =>
  proxyPerplexityGatewayJson(req, res, '/perplexity/search', req.body ?? {}),
)

app.post('/api/perplexity/embed', (req, res) =>
  proxyPerplexityGatewayJson(req, res, '/perplexity/embed', req.body ?? {}),
)

app.post('/api/perplexity/context-embed', (req, res) =>
  proxyPerplexityGatewayJson(req, res, '/perplexity/context-embed', req.body ?? {}),
)

function alchemyGatewayBaseUrl() {
  return x402Env.alchemyX402GatewayUrl()
}

/** Alchemy uses Bearer when ALCHEMY_API_KEY is set; otherwise forward payment headers from the browser. */
function alchemyGatewayAuthHeaders(req) {
  const apiKey = process.env.ALCHEMY_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  const headers = { ...forwardHeaders }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function alchemyGatewayPaymentHint(req) {
  const apiKey = process.env.ALCHEMY_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  return !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
    ? 'Connect wallet on mainnet and complete payment (x402), or set ALCHEMY_API_KEY on the server.'
    : undefined
}

/**
 * Alchemy proxy — forwards to `/:network/v2` (JSON-RPC) and `/:network/nft/v3/...` (NFT API v3).
 * Browser calls `/api/alchemy/...`; upstream path is the same without the `/api` prefix.
 * @see ALCHEMY_X402_GATEWAY_URL
 */
async function proxyAlchemyGateway(req, res) {
  const suffix = req.url || '/'
  const endpoint = `${alchemyGatewayBaseUrl()}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
  const method = (req.method || 'GET').toUpperCase()

  const headers = { ...alchemyGatewayAuthHeaders(req) }
  const fetchOpts = { method, headers }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const payload = req.body !== undefined && req.body !== null ? req.body : {}
    fetchOpts.headers = { ...headers, 'Content-Type': 'application/json' }
    fetchOpts.body = JSON.stringify(payload)
  }

  try {
    const response = await fetch(endpoint, fetchOpts)
    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = raw
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Alchemy request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint: alchemyGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'alchemy-x402-gateway',
      endpoint,
      result: data,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Alchemy integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.use('/api/alchemy', (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,HEAD,POST,OPTIONS')
    return res.status(204).end()
  }
  return proxyAlchemyGateway(req, res)
})

function falGatewayBaseUrl() {
  return x402Env.falX402GatewayUrl()
}

/** fal.ai uses Bearer when FAL_API_KEY is set; otherwise forward payment headers from the browser. */
function falGatewayAuthHeaders(req) {
  const apiKey = process.env.FAL_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  const headers = { ...forwardHeaders }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function falGatewayPaymentHint(req) {
  const apiKey = process.env.FAL_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  return !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
    ? 'Connect wallet on mainnet and complete payment (x402), or set FAL_API_KEY on the server.'
    : undefined
}

/**
 * fal.ai proxy — image / video / audio model endpoints (`POST /fal-ai/...`, `POST /xai/...`, etc.).
 * Browser calls `/api/fal/...`; upstream path is the same without the `/api` prefix.
 * @see FAL_X402_GATEWAY_URL
 */
async function proxyFalGateway(req, res) {
  const suffix = req.url || '/'
  const endpoint = `${falGatewayBaseUrl()}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
  const method = (req.method || 'GET').toUpperCase()

  const headers = { ...falGatewayAuthHeaders(req) }
  const fetchOpts = { method, headers }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const payload = req.body !== undefined && req.body !== null ? req.body : {}
    fetchOpts.headers = { ...headers, 'Content-Type': 'application/json' }
    fetchOpts.body = JSON.stringify(payload)
  }

  try {
    const response = await fetch(endpoint, fetchOpts)
    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = raw
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'fal request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint: falGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'fal-x402-gateway',
      endpoint,
      result: data,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'fal integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.use('/api/fal', (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,HEAD,POST,OPTIONS')
    return res.status(204).end()
  }
  return proxyFalGateway(req, res)
})

function replicateGatewayBaseUrl() {
  return x402Env.replicateX402GatewayUrl()
}

/** Replicate uses Bearer when REPLICATE_API_KEY is set; otherwise forward payment headers from the browser. */
function replicateGatewayAuthHeaders(req) {
  const apiKey = process.env.REPLICATE_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  const headers = { ...forwardHeaders }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function replicateGatewayPaymentHint(req) {
  const apiKey = process.env.REPLICATE_API_KEY
  const forwardHeaders = getForwardAuthHeaders(req)
  return !apiKey?.trim() && !forwardHeaders.Payment && !forwardHeaders['Payment-Receipt']
    ? 'Connect wallet on mainnet and complete payment (x402), or set REPLICATE_API_KEY on the server.'
    : undefined
}

/**
 * Replicate proxy — `POST /replicate/run`, `/replicate/get-prediction`, `/replicate/get-model`, `/replicate/list-models`.
 * Browser calls `/api/replicate/...`; upstream path is the same without the `/api` prefix.
 * @see REPLICATE_X402_GATEWAY_URL
 */
async function proxyReplicateGateway(req, res) {
  const suffix = req.url || '/'
  const endpoint = `${replicateGatewayBaseUrl()}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
  const method = (req.method || 'GET').toUpperCase()

  const headers = { ...replicateGatewayAuthHeaders(req) }
  const fetchOpts = { method, headers }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const payload = req.body !== undefined && req.body !== null ? req.body : {}
    fetchOpts.headers = { ...headers, 'Content-Type': 'application/json' }
    fetchOpts.body = JSON.stringify(payload)
  }

  try {
    const response = await fetch(endpoint, fetchOpts)
    if (response.status === 402) return sendFetchResponse(res, response)

    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = raw
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Replicate request failed.',
        details: data ?? raw,
        upstreamStatus: response.status,
        upstreamEndpoint: endpoint,
        hint: replicateGatewayPaymentHint(req),
      })
    }

    return res.status(response.status).json({
      provider: 'replicate-x402-gateway',
      endpoint,
      result: data,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Replicate integration request failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

app.use('/api/replicate', (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,HEAD,POST,OPTIONS')
    return res.status(204).end()
  }
  return proxyReplicateGateway(req, res)
})

app.post('/api/ai/explain-flow', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const { flowTitle, flowSubtitle, steps } = req.body ?? {}

  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY is not set on the server.',
    })
  }

  if (
    typeof flowTitle !== 'string' ||
    typeof flowSubtitle !== 'string' ||
    !Array.isArray(steps) ||
    steps.length === 0
  ) {
    return res.status(400).json({
      error: 'Invalid payload. Expected flowTitle, flowSubtitle, and steps[].',
    })
  }

  try {
    const prompt = [
      'You are explaining a HealthTech payment flow to non-technical users.',
      'Return 3 short bullets:',
      '1) Why this flow matters',
      '2) How payment works with Arc Testnet x402',
      '3) What user trust benefit they get',
      '',
      `Flow title: ${flowTitle}`,
      `Flow subtitle: ${flowSubtitle}`,
      `Steps: ${steps.join(' -> ')}`,
    ].join('\n')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You write concise product explanations for payment-enabled web apps. Keep it plain and practical.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(response.status).json({
        error: 'OpenAI request failed.',
        details: errorText,
      })
    }

    const data = await response.json()
    const explanation = data?.choices?.[0]?.message?.content?.trim()

    if (!explanation) {
      return res.status(502).json({ error: 'OpenAI returned an empty response.' })
    }

    return res.json({ explanation, model })
  } catch (error) {
    return res.status(500).json({
      error: 'Unexpected AI proxy error.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
  console.log(`  OpenAPI: GET /openapi.json`)
  console.log(`  Dance extras (live x402): POST /api/dance-extras/live/:flowKey/:network  (GET /api/dance-extras/live to verify)`)
})
