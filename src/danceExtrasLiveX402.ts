/**
 * Arc Testnet + Circle Gateway x402 for `POST /api/dance-extras/live/...` (browser wallet).
 */
import { createArcX402PaymentFetch } from './arcX402Fetch'
import { ensureGatewayDepositForX402 } from './arcGatewayDeposit'
import type { BrowserEthereumProvider } from './evmWallet'
import { arcTestnetChain } from './arcChains'

export type DanceLiveNetwork = 'testnet' | 'mainnet'

export const toHexChainId = (id: number) => `0x${id.toString(16)}`

export const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown error'
}

export const extractHexHash = (value: string) => {
  const prefixed = value.match(/0x[a-fA-F0-9]{64}/)
  if (prefixed) return prefixed[0]
  const bare = value.match(/\b[a-fA-F0-9]{64}\b/)
  return bare ? `0x${bare[0]}` : ''
}

export function httpFailureMessage(res: Response, text: string, data: unknown, fallback: string) {
  if (res.status === 404 && /cannot\s+post/i.test(text)) {
    return (
      'API route not found (404). Restart the backend (`npm run server` on port 8787) or run `npm run dev:full` with Vite. ' +
      'Verify: GET http://localhost:8787/api/dance-extras/live should return JSON with flowKeys.'
    )
  }
  const errObj = data && typeof data === 'object' ? (data as { error?: unknown; details?: unknown }) : null
  if (typeof errObj?.error === 'string' && errObj.error) return errObj.error
  if (errObj?.details != null) return String(errObj.details)
  const trimmed = text?.trim() ?? ''
  if (trimmed && !trimmed.startsWith('<!') && trimmed.length < 800) return trimmed
  return fallback
}

export function mapLivePayError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('timed out while waiting for call bundle id')) {
    return 'Wallet submitted the call bundle, but confirmation polling timed out. Check Arc explorer.'
  }
  if (lower.includes('user rejected') || lower.includes('rejected the request')) {
    return 'Transaction approval was rejected in wallet.'
  }
  if (lower.includes('insufficientbalance') || lower.includes('amount exceeds balance')) {
    return 'Insufficient balance for this payment on Arc Testnet.'
  }
  return message
}

export async function parseResponseJson(res: Response) {
  const text = await res.text()
  try {
    return { data: text ? JSON.parse(text) : null, text }
  } catch {
    return { data: null, text }
  }
}

type EthWindow = {
  isMetaMask?: boolean
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export async function addArcNetwork(ethereum: EthWindow, _target: DanceLiveNetwork) {
  const chain = arcTestnetChain
  const rpcUrl = chain.rpcUrls.default.http[0]
  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: toHexChainId(chain.id),
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [rpcUrl],
        blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
      },
    ],
  })
}

export async function ensureSelectedWalletNetwork(ethereum: EthWindow, _network: DanceLiveNetwork) {
  const chain = arcTestnetChain
  const chainIdHex = toHexChainId(chain.id)
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  } catch (err: unknown) {
    const e = err as { code?: number }
    if (e?.code === 4902) {
      await addArcNetwork(ethereum, 'testnet')
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      })
      return
    }
    throw err
  }
}

export async function liveX402Fetch(
  url: string,
  init: RequestInit,
  opts: { walletAddress: `0x${string}`; network: DanceLiveNetwork },
): Promise<Response> {
  const { walletAddress } = opts
  const eth = window.ethereum as BrowserEthereumProvider | undefined
  if (!eth) throw new Error('Wallet not found.')
  await ensureSelectedWalletNetwork(eth as EthWindow, opts.network)
  await ensureGatewayDepositForX402(eth, walletAddress)
  const fetchWithPay = createArcX402PaymentFetch(eth, walletAddress)
  return fetchWithPay(url, init)
}
