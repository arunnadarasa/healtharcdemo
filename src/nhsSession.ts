export type NhsRole = 'patient' | 'gp' | 'nhc_provider'
export type NhsNetwork = 'testnet' | 'mainnet'

const WALLET_KEY = 'nhs_wallet'
const PATIENT_ID_KEY = 'nhs_patient_id'
const NETWORK_KEY = 'nhs_network'

/** Hackathon demo: API headers always use GP (clinician) — no patient / NHC switcher in UI. */
export function getStoredRole(): NhsRole {
  return 'gp'
}

/** Kept for API compatibility; role is fixed to `gp` in this build. */
export function setStoredRole(_role: NhsRole) {
  void _role
}

export function getStoredWallet(): string {
  return localStorage.getItem(WALLET_KEY) || ''
}

export function setStoredWallet(wallet: string) {
  localStorage.setItem(WALLET_KEY, wallet)
}

/** Clears the remembered address for this app (does not revoke site access in MetaMask). */
export function clearStoredWallet() {
  localStorage.removeItem(WALLET_KEY)
}

export function getStoredPatientId(): string {
  return localStorage.getItem(PATIENT_ID_KEY) || ''
}

export function setStoredPatientId(patientId: string) {
  localStorage.setItem(PATIENT_ID_KEY, patientId)
}

export function getStoredNetwork(): NhsNetwork {
  const raw = localStorage.getItem(NETWORK_KEY)
  return raw === 'mainnet' ? 'mainnet' : 'testnet'
}

export function setStoredNetwork(network: NhsNetwork) {
  localStorage.setItem(NETWORK_KEY, network)
}

export function getAuthHeaders(role: NhsRole, wallet: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-user-role': role,
    'x-wallet-address': wallet,
  }
}

