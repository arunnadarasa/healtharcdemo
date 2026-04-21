/**
 * Shared copy-paste strings + payload for judge-score live routes (testnet/mainnet labels).
 */
import type { DanceLiveNetwork } from './danceExtrasLiveX402'

export const LOCAL_API = 'http://127.0.0.1:8787'

export const BODY_TESTNET_STR = `{"network":"testnet","battleId":"battle_demo","roundId":"round_1","judgeId":"judge_1","dancerId":"dancer_1","score":8.7}`

export const BODY_MAINNET_STR = `{"network":"mainnet","battleId":"battle_demo","roundId":"round_1","judgeId":"judge_1","dancerId":"dancer_1","score":8.7}`

export function judgePayload(network: DanceLiveNetwork): Record<string, unknown> {
  return JSON.parse(network === 'testnet' ? BODY_TESTNET_STR : BODY_MAINNET_STR)
}

export function bodyString(network: DanceLiveNetwork) {
  return network === 'testnet' ? BODY_TESTNET_STR : BODY_MAINNET_STR
}

export function buildCurlJudgeWire(network: DanceLiveNetwork): string {
  const path = network === 'testnet' ? 'testnet' : 'mainnet'
  const body = bodyString(network)
  return `curl -s -w "\\nHTTP:%{http_code}\\n" -X POST \\
  "${LOCAL_API}/api/dance-extras/live/judge-score/${path}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`
}
