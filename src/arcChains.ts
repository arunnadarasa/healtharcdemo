import { arcTestnet } from 'viem/chains'

/** Arc Testnet — [Arc docs](https://docs.arc.network/arc/references/connect-to-arc) */
export const ARC_TESTNET_CHAIN_ID = 5042002 as const

/** USDC on Arc Testnet (Circle Gateway / App Kit configs) */
export const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000' as const

export const arcTestnetChain = arcTestnet
