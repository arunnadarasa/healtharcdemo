import { tempo as tempoMainnet, tempoModerato } from 'viem/chains'

/** Testnet preset for `viem/tempo` TIP-20 factory — chain id 42431 */
export const tip20TestnetChain = tempoModerato.extend({
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  feeToken: '0x20c0000000000000000000000000000000000001',
  blockTime: 30_000,
})

/** Mainnet preset for `viem/tempo` TIP-20 factory */
export const tip20MainnetChain = tempoMainnet.extend({
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  feeToken: '0x20c000000000000000000000b9537d11c60e8b50',
  blockTime: 30_000,
})
