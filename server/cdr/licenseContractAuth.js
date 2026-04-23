import {
  createPublicClient,
  http,
  isAddress,
  stringToHex,
} from 'viem'

const ARC_TESTNET_CHAIN = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
}

const licenseConditionAbi = [
  {
    type: 'function',
    name: 'hasValidLicense',
    stateMutability: 'view',
    inputs: [
      { name: 'requester', type: 'address' },
      { name: 'licenseId', type: 'uint256' },
      { name: 'requiredScope', type: 'bytes32' },
    ],
    outputs: [
      { name: 'allowed', type: 'bool' },
      { name: 'code', type: 'uint8' },
    ],
  },
]

function normalizeArcRpcUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return 'https://rpc.testnet.arc.network'
  try {
    const url = new URL(value)
    if (url.hostname === 'rpc-testnet.arcscan.app') {
      return 'https://rpc.testnet.arc.network'
    }
    return value
  } catch {
    return value
  }
}

function arcRpcUrl() {
  return normalizeArcRpcUrl(process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network')
}

let _client = null
function getArcClient() {
  if (_client) return _client
  _client = createPublicClient({
    chain: ARC_TESTNET_CHAIN,
    transport: http(arcRpcUrl(), { timeout: 12000 }),
  })
  return _client
}

function codeToReason(code) {
  switch (Number(code)) {
    case 1:
      return 'license_missing'
    case 2:
      return 'license_revoked'
    case 3:
      return 'license_expired'
    case 4:
      return 'requester_not_holder'
    case 5:
      return 'scope_mismatch'
    default:
      return 'unknown'
  }
}

function scopeToBytes32(raw) {
  const value = String(raw || '').trim()
  if (!value) return `0x${'00'.repeat(32)}`
  if (value.startsWith('0x')) {
    const hex = value.toLowerCase()
    if (/^0x[a-f0-9]{64}$/.test(hex)) return hex
  }
  const scoped = value.length > 31 ? value.slice(0, 31) : value
  return stringToHex(scoped, { size: 32 })
}

export function parseTokenPolicyFromPayload(body) {
  const candidate = body?.tokenPolicy && typeof body.tokenPolicy === 'object' ? body.tokenPolicy : {}
  const contractAddress = String(candidate.contractAddress || body?.conditionRef || '').trim()
  const licenseIdRaw = candidate.licenseId
  const licenseId = Number.parseInt(String(licenseIdRaw ?? ''), 10)
  const requiredScope = String(candidate.requiredScope || '')
  const metadata = {
    contractAddress,
    licenseId,
    requiredScope,
    requiredScopeBytes32: scopeToBytes32(requiredScope),
  }

  if (!contractAddress || !isAddress(contractAddress)) {
    return { ok: false, error: 'token policy requires valid contractAddress.', metadata }
  }
  if (!Number.isFinite(licenseId) || licenseId <= 0) {
    return { ok: false, error: 'token policy requires numeric licenseId > 0.', metadata }
  }
  return { ok: true, tokenPolicy: metadata }
}

export async function verifyTokenPolicyAccess({ tokenPolicy, requesterWallet }) {
  const requester = String(requesterWallet || '').trim().toLowerCase()
  const rpcUrl = arcRpcUrl()
  if (!requester || !isAddress(requester)) {
    return {
      ok: true,
      allowed: false,
      reason: 'requester_wallet_missing',
      authorizationStatus: 'denied',
      rawCode: null,
    }
  }
  try {
    const client = getArcClient()
    const [allowed, code] = await client.readContract({
      address: tokenPolicy.contractAddress,
      abi: licenseConditionAbi,
      functionName: 'hasValidLicense',
      args: [requester, BigInt(tokenPolicy.licenseId), tokenPolicy.requiredScopeBytes32],
    })
    if (allowed) {
      return { ok: true, allowed: true, reason: 'ok', authorizationStatus: 'authorized', rawCode: Number(code) }
    }
    return {
      ok: true,
      allowed: false,
      reason: codeToReason(code),
      authorizationStatus: 'denied',
      rawCode: Number(code),
    }
  } catch (error) {
    return {
      ok: false,
      allowed: false,
      reason: 'authorization_check_failed',
      authorizationStatus: 'error',
      rawCode: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
