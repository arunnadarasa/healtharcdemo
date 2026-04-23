import 'dotenv/config'
import '@nomicfoundation/hardhat-ethers'
import type { HardhatUserConfig } from 'hardhat/config'

const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim() || ''

const accounts =
  privateKey.length === 0
    ? []
    : [privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`]

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arcTestnet: {
      type: 'http',
      chainType: 'l1',
      url: process.env.ARC_RPC_URL?.trim() || 'https://rpc-testnet.arcscan.app',
      chainId: 5042002,
      accounts,
    },
  },
}

export default config
