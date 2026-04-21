/**
 * x402 gateway URLs and seller config. Prefer `X402_*` / `*_X402_GATEWAY_*` env vars;
 * older names are still read for compatibility (see each getter).
 */
function trimSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

export function x402SellerAddress() {
  return (
    process.env.X402_SELLER_ADDRESS ||
    process.env.MPP_RECIPIENT ||
    '0x742d35Cc6634c0532925a3b844bC9e7595F8fE00'
  )
}

export function agentmailWalletGatewayBaseUrl() {
  return trimSlash(
    process.env.AGENTMAIL_WALLET_GATEWAY_URL || process.env.AGENTMAIL_MPP_BASE_URL || 'https://mpp.api.agentmail.to',
  )
}

export function lasoCardPath() {
  return process.env.LASO_CARD_PATH || process.env.LASO_MPP_PATH || '/get-card'
}

export function openAiX402GatewayUrl() {
  return trimSlash(
    process.env.OPENAI_X402_GATEWAY_URL ||
      process.env.OPENAI_MPP_BASE_URL ||
      'https://openai.mpp.tempo.xyz',
  )
}

export function anthropicX402GatewayUrl() {
  return trimSlash(
    process.env.ANTHROPIC_X402_GATEWAY_URL ||
      process.env.ANTHROPIC_MPP_BASE_URL ||
      'https://anthropic.mpp.tempo.xyz',
  )
}

export function openRouterX402GatewayUrl() {
  return trimSlash(
    process.env.OPENROUTER_X402_GATEWAY_URL ||
      process.env.OPENROUTER_MPP_BASE_URL ||
      'https://openrouter.mpp.tempo.xyz',
  )
}

export function perplexityX402GatewayUrl() {
  return trimSlash(
    process.env.PERPLEXITY_X402_GATEWAY_URL ||
      process.env.PERPLEXITY_MPP_BASE_URL ||
      'https://perplexity.mpp.tempo.xyz',
  )
}

export function alchemyX402GatewayUrl() {
  return trimSlash(
    process.env.ALCHEMY_X402_GATEWAY_URL || process.env.ALCHEMY_MPP_BASE_URL || 'https://mpp.alchemy.com',
  )
}

export function falX402GatewayUrl() {
  return trimSlash(process.env.FAL_X402_GATEWAY_URL || process.env.FAL_MPP_BASE_URL || 'https://fal.mpp.tempo.xyz')
}

export function replicateX402GatewayUrl() {
  return trimSlash(
    process.env.REPLICATE_X402_GATEWAY_URL ||
      process.env.REPLICATE_MPP_BASE_URL ||
      'https://replicate.mpp.paywithlocus.com',
  )
}
