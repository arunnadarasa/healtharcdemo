import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { writeContractSync } from 'viem/actions'
import { TokenId, TokenRole } from 'ox/tempo'
import { Abis, Actions, tempoActions } from 'viem/tempo'
import type { NhsNetwork } from './nhsSession'
import { tip20MainnetChain, tip20TestnetChain } from './tip20Chains'
import { browserWalletTransport, type BrowserEthereumProvider, TIP20_DECIMALS } from './evmWallet'

function toHexChainId(id: number) {
  return `0x${id.toString(16)}`
}

async function ensureTip20WalletNetwork(ethereum: BrowserEthereumProvider, network: NhsNetwork) {
  const chain = network === 'mainnet' ? tip20MainnetChain : tip20TestnetChain
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

export type Tip20LaunchResult = {
  tokenAddress: `0x${string}`
  txHash: `0x${string}`
  tokenId: string
  blockNumber: bigint
  name: string
  symbol: string
  currency: string
}

/**
 * Deploy a new TIP-20 via the factory (`Actions.token.createSync`) on testnet or mainnet.
 * Requires the wallet to be on the matching chain and to pay fees in the chain fee token.
 */
export async function launchTip20OnChain(params: {
  network: NhsNetwork
  walletAddress: `0x${string}`
  name: string
  symbol: string
  currency: string
}): Promise<Tip20LaunchResult> {
  const ethereum = (window as Window & { ethereum?: BrowserEthereumProvider }).ethereum
  if (!ethereum) throw new Error('Wallet provider not found.')

  await ensureTip20WalletNetwork(ethereum, params.network)
  const chain = params.network === 'mainnet' ? tip20MainnetChain : tip20TestnetChain
  const client = createWalletClient({
    chain,
    transport: browserWalletTransport(ethereum, chain.rpcUrls.default.http[0]),
    account: params.walletAddress,
  }).extend(tempoActions())

  const result = await Actions.token.createSync(client, {
    name: params.name.trim(),
    symbol: params.symbol.trim(),
    currency: params.currency.trim(),
    admin: params.walletAddress,
  })

  const txHash = result.receipt.transactionHash
  const blockNumber = result.receipt.blockNumber
  const tokenAddress = result.token as `0x${string}`

  return {
    tokenAddress,
    txHash,
    tokenId: String(result.tokenId),
    blockNumber,
    name: result.name,
    symbol: result.symbol,
    currency: result.currency,
  }
}

export type Tip20MintResult = {
  /** `mint` transaction. */
  txHash: `0x${string}`
  /** Present when the wallet had to grant itself `ISSUER_ROLE` first (factory `admin` is not an issuer by default). */
  grantIssuerTxHash?: `0x${string}`
}

/**
 * Mint TIP-20 tokens to an address (caller must be permitted to mint — typically the token admin from `createSync`).
 * `amountHuman` is a decimal string interpreted with {@link TIP20_DECIMALS} (6 for typical stable-style assets).
 */
export async function mintTip20OnChain(params: {
  network: NhsNetwork
  walletAddress: `0x${string}`
  tokenAddress: `0x${string}`
  to: `0x${string}`
  amountHuman: string
}): Promise<Tip20MintResult> {
  const ethereum = (window as Window & { ethereum?: BrowserEthereumProvider }).ethereum
  if (!ethereum) throw new Error('Wallet provider not found.')

  await ensureTip20WalletNetwork(ethereum, params.network)
  const chain = params.network === 'mainnet' ? tip20MainnetChain : tip20TestnetChain
  const rpcUrl = chain.rpcUrls.default.http[0]
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }).extend(tempoActions())

  const walletClient = createWalletClient({
    chain,
    transport: browserWalletTransport(ethereum, rpcUrl),
    account: params.walletAddress,
  }).extend(tempoActions())

  const hasIssuer = await Actions.token.hasRole(publicClient, {
    account: params.walletAddress,
    role: 'issuer',
    token: params.tokenAddress,
  })

  let grantIssuerTxHash: `0x${string}` | undefined
  if (!hasIssuer) {
    const grantReceipt = await writeContractSync(walletClient, {
      address: TokenId.toAddress(params.tokenAddress),
      abi: Abis.tip20,
      functionName: 'grantRole',
      args: [TokenRole.serialize('issuer'), params.walletAddress],
      chain,
      account: params.walletAddress,
    })
    grantIssuerTxHash = grantReceipt.transactionHash
  }

  const amount = parseUnits(params.amountHuman.trim(), TIP20_DECIMALS)
  const result = await Actions.token.mintSync(walletClient, {
    token: params.tokenAddress,
    to: params.to,
    amount,
  })

  return { txHash: result.receipt.transactionHash, grantIssuerTxHash }
}
