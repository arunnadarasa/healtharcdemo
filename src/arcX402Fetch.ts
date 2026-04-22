/**
 * Circle Gateway nanopayments + x402: browser wallet pays via EIP-3009 (batch) or exact EVM scheme.
 * @see https://developers.circle.com/gateway/nanopayments
 */
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { wrapFetchWithPayment } from '@x402/fetch'
import { registerBatchScheme } from '@circle-fin/x402-batching/client'
import { ExactEvmScheme, registerExactEvmScheme } from '@x402/evm/exact/client'
import { createWalletClient, custom, fallback, http, type WalletClient } from 'viem'
import { arcTestnetChain } from './arcChains'
import type { BrowserEthereumProvider } from './evmWallet'
type X402EvmSigner = {
  address: `0x${string}`
  signTypedData: (params: Record<string, unknown>) => Promise<string>
}

function wrapTransportWithArcPublicRpc(
  ethereum: BrowserEthereumProvider,
  publicRpcHttpUrl: string,
) {
  return fallback([http(publicRpcHttpUrl), custom(ethereum)])
}

function evmSignerFromWallet(walletClient: WalletClient, walletAddress: `0x${string}`) {
  const address = walletClient.account?.address ?? walletAddress
  return {
    address,
    /** Circle batch + Exact EVM expect EIP-712 params; viem needs explicit `account` for JSON-RPC wallets. */
    signTypedData: (params: Record<string, unknown>) =>
      walletClient.signTypedData({
        ...(params as Parameters<WalletClient['signTypedData']>[0]),
        account: walletAddress,
      }),
  }
}

function buildArcX402ClientFromSigner(signer: X402EvmSigner) {
  const client = new x402Client()
  registerBatchScheme(client, {
    // Structural match at runtime; viem JSON-RPC account types are narrower than x402 BatchEvmSigner.
    signer: signer as never,
    fallbackScheme: new ExactEvmScheme(signer as never),
  })
  return new x402HTTPClient(client)
}

function buildArcX402Client(ethereum: BrowserEthereumProvider, walletAddress: `0x${string}`) {
  const rpc = arcTestnetChain.rpcUrls.default.http[0]
  const walletClient = createWalletClient({
    account: walletAddress,
    chain: arcTestnetChain,
    transport: wrapTransportWithArcPublicRpc(ethereum, rpc),
  })
  const signer = evmSignerFromWallet(walletClient, walletAddress)
  return buildArcX402ClientFromSigner(signer)
}

export function createArcX402PaymentFetch(ethereum: BrowserEthereumProvider, walletAddress: `0x${string}`) {
  const httpClient = buildArcX402Client(ethereum, walletAddress)
  return wrapFetchWithPayment(fetch, httpClient)
}

export function createArcX402PaymentFetchWithSigner(signer: X402EvmSigner) {
  const httpClient = buildArcX402ClientFromSigner(signer)
  return wrapFetchWithPayment(fetch, httpClient)
}

/**
 * Thirdweb `settlePayment` advertises x402 v2 but uses v1-shaped `accepts[]` fields (`maxAmountRequired`).
 * `@x402` v2 EIP-3009 path expects `amount`; without it, `BigInt(undefined)` throws during signing.
 */
function normalizeThirdwebPaymentRequirements(client: x402Client) {
  client.onBeforePaymentCreation(async (ctx) => {
    const req = ctx.selectedRequirements as unknown as Record<string, string | undefined>
    if (req && req.amount == null && typeof req.maxAmountRequired === 'string') {
      req.amount = req.maxAmountRequired
    }
  })
}

/**
 * Exact EVM (EIP-3009) only — for thirdweb x402 facilitator (no Circle Gateway batch scheme).
 */
export function createExactArcX402PaymentFetch(ethereum: BrowserEthereumProvider, walletAddress: `0x${string}`) {
  const rpc = arcTestnetChain.rpcUrls.default.http[0]
  const walletClient = createWalletClient({
    account: walletAddress,
    chain: arcTestnetChain,
    transport: wrapTransportWithArcPublicRpc(ethereum, rpc),
  })
  const signer = evmSignerFromWallet(walletClient, walletAddress)
  const client = new x402Client()
  registerExactEvmScheme(client, {
    signer: signer as never,
    networks: ['eip155:5042002'],
  })
  normalizeThirdwebPaymentRequirements(client)
  return wrapFetchWithPayment(fetch, new x402HTTPClient(client))
}

export function createExactArcX402PaymentFetchWithSigner(signer: X402EvmSigner) {
  const client = new x402Client()
  registerExactEvmScheme(client, {
    signer: signer as never,
    networks: ['eip155:5042002'],
  })
  normalizeThirdwebPaymentRequirements(client)
  return wrapFetchWithPayment(fetch, new x402HTTPClient(client))
}
