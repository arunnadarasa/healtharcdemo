import { parseUnits } from 'viem'
import { ARC_GATEWAY_DOMAIN, GATEWAY_API_TESTNET } from './arcGatewayConstants'

/** Available USDC (6 decimals) held in Circle Gateway for this depositor on Arc Testnet. */
export async function getGatewayAvailableUsdc(address: `0x${string}`): Promise<bigint> {
  const res = await fetch(`${GATEWAY_API_TESTNET}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'USDC',
      sources: [{ depositor: address, domain: ARC_GATEWAY_DOMAIN }],
    }),
  })
  const data = (await res.json()) as { message?: string; balances?: Array<{ balance: string }> }
  if (!res.ok) {
    throw new Error(data.message ?? `Gateway balance request failed (HTTP ${res.status}).`)
  }
  if (!data.balances?.length) {
    return 0n
  }
  return parseUnits(data.balances[0].balance, 6)
}
