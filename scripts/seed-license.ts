import { readFile } from 'node:fs/promises'
import { ethers } from 'ethers'

function env(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

async function main() {
  const rpcUrl = process.env.ARC_RPC_URL?.trim() || 'https://rpc-testnet.arcscan.app'
  const privateKey = env('DEPLOYER_PRIVATE_KEY')
  const contractAddress = env('LICENSE_CONDITION_ADDRESS')
  const holder = env('LICENSE_HOLDER_ADDRESS')
  const scopeRaw = process.env.LICENSE_SCOPE?.trim() || 'NIHR_APPROVED'
  const expiresInDays = Number.parseInt(process.env.LICENSE_EXPIRES_IN_DAYS?.trim() || '30', 10)
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
    throw new Error('LICENSE_EXPIRES_IN_DAYS must be a positive integer')
  }

  const normalizedPk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(normalizedPk, provider)

  const artifactPath = new URL('../artifacts/contracts/LicenseCondition.sol/LicenseCondition.json', import.meta.url)
  const artifactRaw = await readFile(artifactPath, 'utf8')
  const artifact = JSON.parse(artifactRaw) as { abi: unknown[] }
  const contract = new ethers.Contract(contractAddress, artifact.abi, signer)
  const block = await provider.getBlock('latest')
  const now = Number(block?.timestamp || Math.floor(Date.now() / 1000))
  const expiresAt = now + expiresInDays * 24 * 60 * 60

  const scope = ethers.encodeBytes32String(scopeRaw.slice(0, 31))
  const tx = await contract.issueLicense(holder, scope, expiresAt)
  const receipt = await tx.wait()

  const issuedEvent = receipt?.logs
    ?.map((log) => {
      try {
        return contract.interface.parseLog(log)
      } catch {
        return null
      }
    })
    .find((e) => e?.name === 'LicenseIssued')

  const licenseId = issuedEvent?.args?.licenseId ? Number(issuedEvent.args.licenseId) : null

  console.log(
    JSON.stringify(
      {
        ok: true,
        contract: contractAddress,
        holder,
        scope: scopeRaw,
        expiresAt,
        txHash: receipt?.hash || tx.hash,
        licenseId,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
