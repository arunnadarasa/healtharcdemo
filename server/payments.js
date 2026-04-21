import crypto from 'node:crypto'
import { PaymentRequest, Receipt } from './receiptWire.js'

/** Creates a mock receipt for demo/simulate mode. */
export function createMockReceipt(intent) {
  const receipt = Receipt.from({
    method: 'x402',
    reference: `0x${crypto.randomBytes(32).toString('hex')}`,
    status: 'success',
    timestamp: new Date().toISOString(),
    externalId: intent.externalId ?? `entry_${intent.id}`,
  })
  return Receipt.serialize(receipt)
}

const DEFAULT_DECIMALS = 6
const DEFAULT_AMOUNT = '10.00'

// Arc Testnet — USDC (Circle Gateway / Arc docs). Mainnet selector maps to same testnet until Arc mainnet is wired.
const ARC_CHAINS = {
  mainnet: { chainId: 5042002, currency: '0x3600000000000000000000000000000000000000' },
  testnet: { chainId: 5042002, currency: '0x3600000000000000000000000000000000000000' },
}

const battleEntries = new Map()
const battleResults = new Map()
const payoutExecutions = new Map()
const coachingSessions = new Map()
const beatLicenses = new Map()
const virtualCards = new Map()

function getPaymentConfig(options = {}) {
  const requestedNetwork = options.network === 'mainnet' ? 'mainnet' : options.network === 'testnet' ? 'testnet' : null
  const useTestnet =
    requestedNetwork === 'testnet'
      ? true
      : requestedNetwork === 'mainnet'
        ? false
        : process.env.ARC_TESTNET !== 'false'
  const chain = useTestnet ? ARC_CHAINS.testnet : ARC_CHAINS.mainnet
  return {
    mode: process.env.PAYMENT_MODE || 'mock',
    testnet: useTestnet,
    chainId: chain.chainId,
    currency: process.env.X402_CURRENCY || process.env.MPP_CURRENCY || chain.currency,
    recipient:
      process.env.X402_SELLER_ADDRESS ||
      process.env.MPP_RECIPIENT ||
      '0x742d35Cc6634c0532925a3b844bC9e7595F8fE00',
    decimals: Number(process.env.X402_DECIMALS || process.env.MPP_DECIMALS || DEFAULT_DECIMALS),
  }
}

function toBaseUnits(amountDisplay, decimals) {
  const [wholeRaw, fractionRaw = ''] = String(amountDisplay).split('.')
  const whole = wholeRaw.replace(/\D/g, '') || '0'
  const fraction = fractionRaw.replace(/\D/g, '').slice(0, decimals).padEnd(decimals, '0')
  return `${whole}${fraction}`.replace(/^0+(?=\d)/, '')
}

export function createBattleEntryIntent({ battleId, dancerId, amountDisplay, network }) {
  const paymentConfig = getPaymentConfig({ network })
  const amount = toBaseUnits(amountDisplay || DEFAULT_AMOUNT, paymentConfig.decimals)
  const intentId = crypto.randomUUID()
  const externalId = `battle_entry_${battleId}_${dancerId}_${intentId}`

  const request = PaymentRequest.from({
    amount,
    currency: paymentConfig.currency,
    recipient: paymentConfig.recipient,
    decimals: paymentConfig.decimals,
    chainId: paymentConfig.chainId,
    description: `Battle ${battleId} entry for dancer ${dancerId}`,
    externalId,
  })

  const entryIntent = {
    intentId,
    battleId,
    dancerId,
    amountDisplay: amountDisplay || DEFAULT_AMOUNT,
    amount,
    status: 'requires_payment',
    mode: paymentConfig.mode,
    testnet: paymentConfig.testnet,
    chainId: paymentConfig.chainId,
    createdAt: new Date().toISOString(),
    request,
    requestEncoded: PaymentRequest.serialize(request),
  }

  battleEntries.set(intentId, entryIntent)
  return entryIntent
}

export function verifyBattleEntryPayment({ intentId, paymentReceipt }) {
  const intent = battleEntries.get(intentId)
  if (!intent) {
    throw new Error('Battle entry intent not found.')
  }

  if (!paymentReceipt) return intent

  const parsed = Receipt.deserialize(paymentReceipt)
  const finalized = {
    ...intent,
    status: 'payment_finalized',
    finalizedAt: new Date().toISOString(),
    receipt: parsed,
  }
  battleEntries.set(intentId, finalized)
  return finalized
}

export function recoverBattleEntryPayment({ intentId, txHash }) {
  const intent = battleEntries.get(intentId)
  if (!intent) {
    throw new Error('Battle entry intent not found.')
  }
  if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    throw new Error('Invalid txHash. Expected 0x-prefixed transaction hash.')
  }

  const recoveredReceipt = Receipt.from({
    method: 'x402',
    reference: txHash,
    status: 'success',
    timestamp: new Date().toISOString(),
    externalId: `battle_entry_recovery_${intent.battleId}_${intent.dancerId}_${intent.intentId}`,
  })

  const finalized = {
    ...intent,
    status: 'payment_finalized',
    finalizedAt: new Date().toISOString(),
    receipt: recoveredReceipt,
  }
  battleEntries.set(intentId, finalized)
  return finalized
}

export function finalizeBattleResults({ battleId, winners }) {
  const result = {
    battleId,
    winners,
    finalizedAt: new Date().toISOString(),
  }
  battleResults.set(battleId, result)
  return result
}

export function executeBattlePayout({ battleId, network }) {
  const paymentConfig = getPaymentConfig({ network })
  const result = battleResults.get(battleId)

  if (!result) {
    throw new Error('Battle result not found. Finalize results before payout.')
  }

  if (paymentConfig.mode === 'live') {
    throw new Error(
      'Live payout execution is not enabled in this scaffold. Switch PAYMENT_MODE=mock for local flow.',
    )
  }

  const payouts = result.winners.map((winner) => {
    const receipt = Receipt.from({
      method: 'x402',
      reference: `mock_settlement_${battleId}_${winner.dancerId}_${crypto.randomUUID()}`,
      status: 'success',
      timestamp: new Date().toISOString(),
      externalId: `battle_payout_${battleId}_${winner.dancerId}`,
    })

    return {
      ...winner,
      status: 'settled',
      receipt,
      receiptEncoded: Receipt.serialize(receipt),
    }
  })

  const execution = {
    battleId,
    mode: paymentConfig.mode,
    executedAt: new Date().toISOString(),
    payouts,
  }

  payoutExecutions.set(battleId, execution)
  return execution
}

export function getBattlePayoutExecution(battleId) {
  return payoutExecutions.get(battleId) || null
}

export function startCoachingSession({ coachId, dancerId, ratePerMinute }) {
  const id = crypto.randomUUID()
  const session = {
    id,
    coachId,
    dancerId,
    ratePerMinute,
    seconds: 0,
    status: 'open',
    createdAt: new Date().toISOString(),
  }
  coachingSessions.set(id, session)
  return session
}

export function tickCoachingSession({ sessionId, seconds }) {
  const session = coachingSessions.get(sessionId)
  if (!session) throw new Error('Session not found.')
  if (session.status !== 'open') throw new Error('Session is not open.')
  session.seconds += seconds
  return session
}

export function endCoachingSession({ sessionId }) {
  const session = coachingSessions.get(sessionId)
  if (!session) throw new Error('Session not found.')
  if (session.status === 'closed') return session

  const minutes = Math.max(1, Math.ceil(session.seconds / 60))
  const total = Number(session.ratePerMinute) * minutes
  const amountDisplay = total.toFixed(2)

  const paymentConfig = getPaymentConfig()
  const amount = toBaseUnits(amountDisplay, paymentConfig.decimals)

  const receipt = Receipt.from({
    method: 'x402',
    reference: `mock_coaching_${sessionId}_${crypto.randomUUID()}`,
    status: 'success',
    timestamp: new Date().toISOString(),
    externalId: `coaching_${session.coachId}_${session.dancerId}`,
  })

  session.status = 'closed'
  session.closedAt = new Date().toISOString()
  session.minutes = minutes
  session.amountDisplay = amountDisplay
  session.amount = amount
  session.receipt = receipt
  session.receiptEncoded = Receipt.serialize(receipt)

  return session
}

export function getCoachingReceipt(sessionId) {
  const session = coachingSessions.get(sessionId)
  if (!session || !session.receipt) return null
  return {
    id: session.id,
    coachId: session.coachId,
    dancerId: session.dancerId,
    minutes: session.minutes,
    amountDisplay: session.amountDisplay,
    receipt: session.receipt,
  }
}

export function createBeatLicenseIntent({ beatId, consumerId, amountDisplay }) {
  const paymentConfig = getPaymentConfig()
  const amount = toBaseUnits(amountDisplay || DEFAULT_AMOUNT, paymentConfig.decimals)
  const licenseId = crypto.randomUUID()
  const externalId = `beat_license_${beatId}_${consumerId}_${licenseId}`

  const request = PaymentRequest.from({
    amount,
    currency: paymentConfig.currency,
    recipient: paymentConfig.recipient,
    decimals: paymentConfig.decimals,
    chainId: paymentConfig.chainId,
    description: `Beat ${beatId} license for consumer ${consumerId}`,
    externalId,
  })

  const license = {
    licenseId,
    beatId,
    consumerId,
    amountDisplay: amountDisplay || DEFAULT_AMOUNT,
    amount,
    status: 'requires_payment',
    createdAt: new Date().toISOString(),
    request,
    requestEncoded: PaymentRequest.serialize(request),
  }

  beatLicenses.set(licenseId, license)
  return license
}

export function grantBeatLicense({ licenseId }) {
  const license = beatLicenses.get(licenseId)
  if (!license) throw new Error('License intent not found.')

  if (license.status === 'active') return license

  const receipt = Receipt.from({
    method: 'x402',
    reference: `mock_beat_${license.beatId}_${license.consumerId}_${crypto.randomUUID()}`,
    status: 'success',
    timestamp: new Date().toISOString(),
    externalId: `beat_license_${license.beatId}_${license.consumerId}`,
  })

  license.status = 'active'
  license.licensedAt = new Date().toISOString()
  license.receipt = receipt
  license.receiptEncoded = Receipt.serialize(receipt)
  license.streamUrl = `https://example.com/secure/beat/${license.beatId}?license=${license.licenseId}`

  return license
}

function randomDigits(length) {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(Math.random() * 10).toString()
  }
  return out
}

function formatCardNumber(raw16) {
  return `${raw16.slice(0, 4)} ${raw16.slice(4, 8)} ${raw16.slice(8, 12)} ${raw16.slice(12, 16)}`
}

export function createVirtualDebitCard({ walletAddress, amountDisplay, currency, label }) {
  if (typeof walletAddress !== 'string' || !walletAddress.startsWith('0x')) {
    throw new Error('Invalid walletAddress. Expected 0x-prefixed address string.')
  }
  const amount = Number.parseFloat(amountDisplay || '5.00')
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid amountDisplay. Expected positive number.')
  }

  const now = new Date()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const year = String((now.getUTCFullYear() + 2) % 100).padStart(2, '0')
  const raw16 = randomDigits(16)
  const cardId = `card_${crypto.randomUUID()}`
  const createdAt = now.toISOString()
  const normalizedCurrency = typeof currency === 'string' && currency.trim() ? currency : 'USD'
  const brand = 'Visa'
  const provider = 'wegiftusd'
  const card = {
    cardId,
    walletAddress,
    brand,
    provider,
    amountDisplay: amount.toFixed(2),
    currency: normalizedCurrency,
    cardNumber: formatCardNumber(raw16),
    expiry: `${month}/${year}`,
    cvv: randomDigits(3),
    status: 'ready',
    label: typeof label === 'string' && label.trim() ? label : 'HealthTech virtual debit card',
    createdAt,
  }

  const receipt = Receipt.from({
    method: 'x402',
    reference: `mock_virtual_card_${cardId}`,
    status: 'success',
    timestamp: createdAt,
    externalId: `virtual_card_${cardId}`,
  })

  card.receipt = receipt
  card.receiptEncoded = Receipt.serialize(receipt)
  virtualCards.set(cardId, card)
  return card
}

export function getVirtualDebitCard(cardId) {
  return virtualCards.get(cardId) || null
}
