import { arcTestnetChain } from './arcChains'
import { ensureGatewayDepositForX402 } from './arcGatewayDeposit'
import { createArcX402PaymentFetch, createExactArcX402PaymentFetch } from './arcX402Fetch'
import type { BrowserEthereumProvider } from './evmWallet'
import type { NhsNetwork } from './nhsSession'
import type { X402FacilitatorId } from './x402FacilitatorPreference'

function toHexChainId(id: number) {
  return `0x${id.toString(16)}`
}

/** Arc Testnet only; `mainnet` in UI maps to the same chain until Arc mainnet is wired in viem. */
export async function ensureWalletOnNetwork(ethereum: BrowserEthereumProvider, _network: NhsNetwork) {
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
  const provider = (window as Window & { ethereum?: BrowserEthereumProvider }).ethereum
  if (!provider) throw new Error('Wallet provider not found for x402 payment mode.')
  if (!opts.wallet) throw new Error('Connect wallet to use x402 mode.')
  await ensureWalletOnNetwork(provider, opts.network)
  const useThirdweb = opts.facilitator === 'thirdweb'
  if (!useThirdweb) {
    await ensureGatewayDepositForX402(provider, opts.wallet as `0x${string}`)
  }
  const fetchWithPay = useThirdweb
    ? createExactArcX402PaymentFetch(provider, opts.wallet as `0x${string}`)
    : createArcX402PaymentFetch(provider, opts.wallet as `0x${string}`)
  return fetchWithPay(url, init)
}
