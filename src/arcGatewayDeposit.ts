import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  maxUint256,
  parseUnits,
} from 'viem'
import { ARC_TESTNET_USDC, arcTestnetChain } from './arcChains'
import { TESTNET_GATEWAY_WALLET } from './arcGatewayConstants'
import { getGatewayAvailableUsdc } from './arcGatewayBalance'
import { browserWalletTransport, type BrowserEthereumProvider } from './evmWallet'

const GATEWAY_WALLET_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

function minAvailableRaw(): bigint {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined
  const s = env?.VITE_GATEWAY_MIN_AVAILABLE_USDC?.trim() ?? '0.5'
  return parseUnits(s, 6)
}

function topupHumanDefault(): string {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined
  return env?.VITE_GATEWAY_TOPUP_USDC?.trim() ?? '1'
}

function skipAutoDeposit(): boolean {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined
  return env?.VITE_GATEWAY_SKIP_AUTO_DEPOSIT === 'true'
}

export async function depositUsdcToGateway(
  ethereum: BrowserEthereumProvider,
  walletAddress: `0x${string}`,
  amountHuman: string,
): Promise<{ approvalTxHash?: `0x${string}`; depositTxHash: `0x${string}` }> {
  const rpc = arcTestnetChain.rpcUrls.default.http[0]
  const transport = browserWalletTransport(ethereum, rpc)
  const publicClient = createPublicClient({ chain: arcTestnetChain, transport })
  const walletClient = createWalletClient({
    account: walletAddress,
    chain: arcTestnetChain,
    transport,
  })

  const amount = parseUnits(amountHuman, 6)
  const balance = await publicClient.readContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })

  if (balance < amount) {
    throw new Error(
      `Insufficient USDC for Gateway deposit. Have ${formatUnits(balance, 6)} USDC, need ${amountHuman}.`,
    )
  }

  const allowance = await publicClient.readContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [walletAddress, TESTNET_GATEWAY_WALLET],
  })

  let approvalTxHash: `0x${string}` | undefined
  if (allowance < amount) {
    approvalTxHash = await walletClient.writeContract({
      address: ARC_TESTNET_USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [TESTNET_GATEWAY_WALLET, maxUint256],
    })
    await publicClient.waitForTransactionReceipt({ hash: approvalTxHash })
  }

  const depositTxHash = await walletClient.writeContract({
    address: TESTNET_GATEWAY_WALLET,
    abi: GATEWAY_WALLET_ABI,
    functionName: 'deposit',
    args: [ARC_TESTNET_USDC, amount],
    gas: 120000n,
  })
  await publicClient.waitForTransactionReceipt({ hash: depositTxHash })
  return { approvalTxHash, depositTxHash }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Ensures enough USDC is deposited into Circle Gateway for batched x402 settlement
 * (same pattern as [circlefin/arc-nanopayments](https://github.com/circlefin/arc-nanopayments) `GatewayClient.deposit`).
 */
export async function ensureGatewayDepositForX402(
  ethereum: BrowserEthereumProvider,
  walletAddress: `0x${string}`,
): Promise<void> {
  if (skipAutoDeposit()) return

  const minAvail = minAvailableRaw()
  let available = await getGatewayAvailableUsdc(walletAddress)
  if (available >= minAvail) return

  const topHuman = topupHumanDefault()
  let topAmount = parseUnits(topHuman, 6)

  const rpc = arcTestnetChain.rpcUrls.default.http[0]
  const transport = browserWalletTransport(ethereum, rpc)
  const publicClient = createPublicClient({ chain: arcTestnetChain, transport })
  const walletUsdc = await publicClient.readContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })

  if (walletUsdc < topAmount) {
    topAmount = walletUsdc
  }

  if (topAmount === 0n) {
    throw new Error(
      'Gateway USDC balance is low and your wallet has no Arc USDC (0x3600…, 6 decimals) to deposit. Use Get testnet funds / Circle Faucet, then retry.',
    )
  }

  const human = formatUnits(topAmount, 6)
  await depositUsdcToGateway(ethereum, walletAddress, human)

  for (let i = 0; i < 4; i++) {
    await sleep(i === 0 ? 1500 : 2000)
    available = await getGatewayAvailableUsdc(walletAddress)
    if (available >= minAvail) return
  }

  throw new Error(
    `Gateway balance still below ${formatUnits(minAvail, 6)} USDC after deposit (read ${formatUnits(available, 6)}). Wait and retry, or check testnet.arcscan.app.`,
  )
}
