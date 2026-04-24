import { arcTestnetChain } from './arcChains'
import { ensureGatewayDepositForX402 } from './arcGatewayDeposit'
import {
  createArcX402PaymentFetch,
  createArcX402PaymentFetchWithSigner,
  createExactArcX402PaymentFetch,
  createExactArcX402PaymentFetchWithSigner,
} from './arcX402Fetch'
import type { BrowserEthereumProvider } from './evmWallet'
import type { NhsNetwork } from './nhsSession'
import type { X402FacilitatorId } from './x402FacilitatorPreference'

const WALLET_MODE_KEY = 'nhs_wallet_mode_v1'
const CIRCLE_WALLET_META_KEY = 'nhs_circle_wallet_meta_v1'
/** Default 5m — slow SQLite FTS / prefix on large HES + x402 handshake can exceed 90s. */
const DEFAULT_X402_REQUEST_TIMEOUT_MS = 300000

function getX402RequestTimeoutMs() {
  const raw = typeof import.meta.env.VITE_X402_REQUEST_TIMEOUT_MS === 'string' ? import.meta.env.VITE_X402_REQUEST_TIMEOUT_MS : ''
  const parsed = Number.parseInt(raw, 10)
  if (Number.isFinite(parsed) && parsed >= 5000 && parsed <= 900000) return parsed
  return DEFAULT_X402_REQUEST_TIMEOUT_MS
}

type CircleWalletMeta = { walletId: string; walletSetId: string; address: string; blockchain?: string }

function toHexChainId(id: number) {
  return `0x${id.toString(16)}`
}

/** Arc Testnet only; `mainnet` in UI maps to the same chain until Arc mainnet is wired in viem. */
export async function ensureWalletOnNetwork(ethereum: BrowserEthereumProvider, _network: NhsNetwork) {
  void _network
  const chain = arcTestnetChain
  const chainId = toHexChainId(chain.id)
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    } as { method: string; params: unknown[] })
  } catch (error) {
    const e = error as { code?: number }
    if (e?.code !== 4902) throw error
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpcUrls.default.http[0]],
          blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
        },
      ],
    } as { method: string; params: unknown[] })
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    } as { method: string; params: unknown[] })
  }
}

export async function nhsX402Fetch(
  url: string,
  init: RequestInit,
  opts: { wallet: string; network: NhsNetwork; facilitator: X402FacilitatorId },
) {
  if (!opts.wallet) throw new Error('Connect wallet to use x402 mode.')
  const effectiveFacilitator = resolveNhsFacilitatorForWallet(opts.wallet, opts.facilitator)
  const walletLower = opts.wallet.toLowerCase()
  const prefersThirdweb = effectiveFacilitator === 'thirdweb'

  const timeoutMs = getX402RequestTimeoutMs()

  const circleMeta = getCircleSigningWalletMeta(walletLower)
  const useThirdweb = prefersThirdweb && !circleMeta
  if (circleMeta) {
    const signer = {
      address: opts.wallet as `0x${string}`,
      signTypedData: (params: Record<string, unknown>) => signTypedDataWithCircleWallet(circleMeta, params, walletLower),
    }
    const fetchWithPay = useThirdweb
      ? createExactArcX402PaymentFetchWithSigner(signer)
      : createArcX402PaymentFetchWithSigner(signer)
    const timedInit = withTimeoutInit(init, timeoutMs)
    try {
      const res = await fetchWithPay(url, timedInit)
      return res
    } catch (e) {
      throw e
    }
  }

  const provider = (window as Window & { ethereum?: BrowserEthereumProvider }).ethereum
  if (!provider) throw new Error('Wallet provider not found for x402 payment mode.')

  // Prevent cryptic viem "requested account/method not authorized" errors:
  // x402 signing uses the injected browser wallet account and must match opts.wallet.
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
    const selected = (accounts?.[0] || '').toLowerCase()
    if (!selected) {
      throw new Error(
        'No authorized browser wallet account. Switch to MetaMask mode and connect the account you want to pay with.',
      )
    }
    if (selected !== walletLower) {
      throw new Error(
        `Active browser wallet (${selected.slice(0, 10)}…${selected.slice(-4)}) does not match selected app wallet (${walletLower.slice(0, 10)}…${walletLower.slice(-4)}). For paid x402 calls, use MetaMask mode and connect the same address.`,
      )
    }
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Browser wallet authorization check failed. Switch to MetaMask mode and reconnect wallet.')
  }

  await ensureWalletOnNetwork(provider, opts.network)
  if (!useThirdweb) {
    await ensureGatewayDepositForX402(provider, opts.wallet as `0x${string}`)
  }
  const fetchWithPay = useThirdweb
    ? createExactArcX402PaymentFetch(provider, opts.wallet as `0x${string}`)
    : createArcX402PaymentFetch(provider, opts.wallet as `0x${string}`)
  const timedInit = withTimeoutInit(init, timeoutMs)
  try {
    const res = await fetchWithPay(url, timedInit)
    return res
  } catch (e) {
    throw e
  }
}

export function resolveNhsFacilitatorForWallet(
  wallet: string,
  requestedFacilitator: X402FacilitatorId,
): X402FacilitatorId {
  const walletLower = (wallet || '').toLowerCase()
  if (!walletLower) return requestedFacilitator
  const circleMeta = getCircleSigningWalletMeta(walletLower)
  if (circleMeta && requestedFacilitator === 'thirdweb') return 'circle'
  return requestedFacilitator
}

function withTimeoutInit(init: RequestInit, timeoutMs: number): RequestInit {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return init
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!init.signal) return { ...init, signal: timeoutSignal }
  return { ...init, signal: AbortSignal.any([init.signal, timeoutSignal]) }
}

function getCircleSigningWalletMeta(walletLower: string): CircleWalletMeta | null {
  try {
    const mode = window.localStorage.getItem(WALLET_MODE_KEY)
    if (mode !== 'circle') return null
    const raw = window.localStorage.getItem(CIRCLE_WALLET_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CircleWalletMeta> | null
    if (!parsed?.walletId || !parsed?.address) return null
    if (parsed.address.toLowerCase() !== walletLower) return null
    return {
      walletId: parsed.walletId,
      walletSetId: String(parsed.walletSetId || ''),
      address: parsed.address,
      blockchain: parsed.blockchain,
    }
  } catch {
    return null
  }
}

async function signTypedDataWithCircleWallet(
  meta: CircleWalletMeta,
  typedData: Record<string, unknown>,
  walletAddress: string,
) {
  const payloadJson = safeJsonStringify({
    walletId: meta.walletId,
    walletAddress,
    typedData,
  })
  const res = await fetch('/api/circle/sign-typed-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadJson,
  })
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok) {
    const msg = extractCircleError(payload)
    throw new Error(msg || `Circle signing failed with status ${res.status}.`)
  }
  const signature =
    typeof payload === 'object' && payload && 'signature' in payload
      ? String((payload as { signature?: string }).signature || '')
      : ''
  if (!signature) {
    throw new Error('Circle signer did not return an EIP-712 signature.')
  }
  return signature
}

function safeJsonStringify(value: unknown) {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
}

function extractCircleError(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const p = payload as { error?: unknown; details?: unknown }
  const error = typeof p.error === 'string' ? p.error : ''
  if (typeof p.details === 'string') return `${error} ${p.details}`.trim()
  if (p.details && typeof p.details === 'object') {
    try {
      return `${error} ${JSON.stringify(p.details)}`.trim()
    } catch {
      return error
    }
  }
  return error
}
