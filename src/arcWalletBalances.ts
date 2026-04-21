import { createPublicClient, erc20Abi, formatUnits, http } from 'viem'
import { ARC_TESTNET_USDC, arcTestnetChain } from './arcChains'
import { getGatewayAvailableUsdc } from './arcGatewayBalance'

export type ArcBalances = {
  walletUsdc: string
  gatewayUsdc: string | null
  gatewayError: string | null
}

function formatUsdc6(value: bigint): string {
  const n = Number.parseFloat(formatUnits(value, 6))
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (abs >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

/**
 * On-chain USDC (Arc Testnet) + Circle Gateway available balance for x402 batching.
 */
export async function fetchArcBalances(wallet: `0x${string}`): Promise<ArcBalances> {
  const rpc = arcTestnetChain.rpcUrls.default.http[0]
  const publicClient = createPublicClient({
    chain: arcTestnetChain,
    transport: http(rpc),
  })
  const raw = await publicClient.readContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [wallet],
  })
  let gatewayUsdc: string | null = null
  let gatewayError: string | null = null
  try {
    const g = await getGatewayAvailableUsdc(wallet)
    gatewayUsdc = formatUsdc6(g)
  } catch (e) {
    gatewayError = e instanceof Error ? e.message : String(e)
  }
  return {
    walletUsdc: formatUsdc6(raw),
    gatewayUsdc,
    gatewayError,
  }
}
