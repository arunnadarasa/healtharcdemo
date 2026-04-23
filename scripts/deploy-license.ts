import { readFile } from 'node:fs/promises'
import { ethers } from 'ethers'

async function main() {
  const rpcUrl = process.env.ARC_RPC_URL?.trim() || 'https://rpc-testnet.arcscan.app'
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim()
  if (!privateKey) throw new Error('Missing DEPLOYER_PRIVATE_KEY in environment')

  const normalizedPk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(normalizedPk, provider)

  const artifactPath = new URL('../artifacts/contracts/LicenseCondition.sol/LicenseCondition.json', import.meta.url)
  const artifactRaw = await readFile(artifactPath, 'utf8')
  const artifact = JSON.parse(artifactRaw) as { abi: unknown[]; bytecode: string }

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
  const contract = await factory.deploy(wallet.address)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  const network = await provider.getNetwork()

  console.log(
    JSON.stringify(
      {
        ok: true,
        contract: 'LicenseCondition',
        address,
        deployer: wallet.address,
        chainId: Number(network.chainId),
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
