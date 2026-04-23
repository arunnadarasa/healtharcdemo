import { useCallback, useMemo, useState } from 'react'
import NhsShell from './NhsShell'
import { apiGet, apiPost } from './nhsApi'
import {
  explorerAddressUrl,
  explorerUrl,
  listNhsTxHistoryCdr,
  NEIGHBOURHOOD_X402_PRICE_DISPLAY,
  type NhsTxItem,
  type WalletMode,
} from './nhsTxHistory'
import {
  getX402FacilitatorPreference,
  setX402FacilitatorPreference,
  type X402FacilitatorId,
} from './x402FacilitatorPreference'
import type { NhsNetwork, NhsRole } from './nhsSession'

type NhsSession = { role: NhsRole; wallet: string; network: NhsNetwork }
type TxModeFilter = 'all' | WalletMode
type PayloadMode = 'text' | 'file'
type PolicyMode = 'allowlist' | 'owner' | 'token' | 'open'
type PolicyTemplate = {
  id: string
  title: string
  policyType: string
  mode: PolicyMode
  payload: string
}
type LinkItem = { label: string; url: string }

const TX_LOG_PAGE_SIZE = 10
const CDR_NOTE = 'Demo only. Synthetic data only. Not clinical advice.'
const DEFAULT_LICENSE_CONDITION_CONTRACT = '0x940b27C45c89ceF8B77328B87D689E309CFDCeD3'

function getDefaultLicenseConditionContract() {
  const env = import.meta.env.VITE_DEFAULT_CDR_LICENSE_CONTRACT?.trim()
  return env || DEFAULT_LICENSE_CONDITION_CONTRACT
}

function collectStorageLinks(value: unknown, path = ''): LinkItem[] {
  if (!value || typeof value !== 'object') return []
  const out: LinkItem[] = []
  const obj = value as Record<string, unknown>
  for (const [key, raw] of Object.entries(obj)) {
    const nextPath = path ? `${path}.${key}` : key
    if (typeof raw === 'string') {
      const looksRelevant = key === 'gatewayUrl' || key === 'ipfsUri' || key === 'tokenUri'
      if (looksRelevant || raw.startsWith('ipfs://') || raw.startsWith('https://gateway.pinata.cloud/ipfs/')) {
        out.push({ label: nextPath, url: raw })
      }
      continue
    }
    if (raw && typeof raw === 'object') out.push(...collectStorageLinks(raw, nextPath))
  }
  return out
}

function toGatewayFallback(url: string): string | null {
  if (!url.startsWith('ipfs://')) return null
  const cid = url.slice('ipfs://'.length).trim()
  return cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'cross_org_records',
    title: 'Cross-Organisation Patient Records',
    policyType: 'Neighbourhood Health',
    mode: 'allowlist',
    payload: JSON.stringify(
      {
        patient_id: 'NHS-7291834',
        diagnosis: 'Type 2 Diabetes',
        medications: ['Metformin 500mg', 'Lisinopril 10mg'],
        referral: 'Community Dietician',
      },
      null,
      2,
    ),
  },
  {
    id: 'core20plus5',
    title: 'Health Inequalities Data Sharing',
    policyType: 'CORE20PLUS5',
    mode: 'token',
    payload: JSON.stringify(
      {
        icb: 'North East London',
        imd_decile: 1,
        population: 42000,
        smoking_rate: 0.28,
      },
      null,
      2,
    ),
  },
  {
    id: 'research_market',
    title: 'Clinical Research Marketplace',
    policyType: '10-Year Health Plan',
    mode: 'token',
    payload: JSON.stringify(
      {
        dataset_id: 'RES-NHS-0042',
        trust: 'Barts Health',
        records: 52000,
        condition: 'cardiovascular',
        licence_required: 'NIHR Approved Researcher',
      },
      null,
      2,
    ),
  },
]

function NhsCdrGrid({
  session,
  payLabel,
  x402Provider,
  onX402ProviderChange,
}: {
  session: NhsSession
  payLabel: string
  x402Provider: X402FacilitatorId
  onX402ProviderChange: (v: X402FacilitatorId) => void
}) {
  const [busy, setBusy] = useState(false)
  const [activeAction, setActiveAction] = useState('')
  const [templateId, setTemplateId] = useState(POLICY_TEMPLATES[0].id)
  const [policyMode, setPolicyMode] = useState<PolicyMode>(POLICY_TEMPLATES[0].mode)
  const [policyType, setPolicyType] = useState(POLICY_TEMPLATES[0].policyType)
  const [allowlistRoot, setAllowlistRoot] = useState('')
  const [tokenContractAddress, setTokenContractAddress] = useState(getDefaultLicenseConditionContract())
  const [tokenLicenseId, setTokenLicenseId] = useState('1')
  const [tokenRequiredScope, setTokenRequiredScope] = useState('NIHR_APPROVED')
  const [assetType, setAssetType] = useState('clinical_note_json')
  const [payloadMode, setPayloadMode] = useState<PayloadMode>('text')
  const [payloadFile, setPayloadFile] = useState<File | null>(null)
  const [enableNftMetadata, setEnableNftMetadata] = useState(true)
  const [metadataName, setMetadataName] = useState('Clinical Arc CDR Asset')
  const [metadataDescription, setMetadataDescription] = useState('Encrypted clinical data reference stored via CDR + IPFS.')
  const [metadataTags, setMetadataTags] = useState('cdr,clinical,arc-testnet')
  const [payloadText, setPayloadText] = useState(POLICY_TEMPLATES[0].payload)
  const [purpose, setPurpose] = useState('care_coordination')
  const [vaultId, setVaultId] = useState('')
  const [lookupVaultId, setLookupVaultId] = useState('')
  const [allocateOut, setAllocateOut] = useState('No vault allocated yet.')
  const [storeOut, setStoreOut] = useState('No encrypted payload written yet.')
  const [storeLinks, setStoreLinks] = useState<LinkItem[]>([])
  const [accessOut, setAccessOut] = useState('No access request yet.')
  const [vaultOut, setVaultOut] = useState('No vault fetched yet.')
  const [auditOut, setAuditOut] = useState('No audit fetched yet.')
  const [licenseOut, setLicenseOut] = useState('No license check/issue yet.')
  const [vaultLinks, setVaultLinks] = useState<LinkItem[]>([])
  const [auditLinks, setAuditLinks] = useState<LinkItem[]>([])

  const [txRows, setTxRows] = useState<NhsTxItem[]>(() => listNhsTxHistoryCdr(session.network))
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')
  const [txPage, setTxPage] = useState(1)

  const selectedTemplate = POLICY_TEMPLATES.find((t) => t.id === templateId) ?? POLICY_TEMPLATES[0]
  const walletExplorer =
    session.wallet && session.wallet.startsWith('0x') ? explorerAddressUrl(session.network, session.wallet) : null

  const refreshTxLog = useCallback(() => {
    setTxRows(listNhsTxHistoryCdr(session.network))
    setTxPage(1)
  }, [session.network])

  const filteredTxRows = useMemo(
    () => txRows.filter((row) => (txModeFilter === 'all' ? true : row.walletMode === txModeFilter)),
    [txRows, txModeFilter],
  )
  const txTotalPages = filteredTxRows.length === 0 ? 0 : Math.ceil(filteredTxRows.length / TX_LOG_PAGE_SIZE)
  const txPageSafe = txTotalPages === 0 ? 1 : Math.min(txPage, txTotalPages)
  const txPageStart = (txPageSafe - 1) * TX_LOG_PAGE_SIZE
  const txPageRows = filteredTxRows.slice(txPageStart, txPageStart + TX_LOG_PAGE_SIZE)

  const requireWallet = (setOut: (value: string) => void) => {
    if (!session.wallet) {
      setOut('Connect a wallet for paid CDR actions.')
      return false
    }
    return true
  }

  const runAllocate = async () => {
    if (!requireWallet(setAllocateOut)) return
    setBusy(true)
    setActiveAction('allocate')
    setAllocateOut('')
    try {
      const res = await apiPost<{
        vaultId: string
        policyMode: string
        policyType: string
      }>(
        '/api/cdr/vaults/allocate',
        session.role,
        session.wallet,
        {
          policyMode,
          policyType: policyType.trim() || selectedTemplate.policyType,
          conditionRef:
            policyMode === 'token' ? tokenContractAddress.trim() || undefined : allowlistRoot.trim() || undefined,
          tokenPolicy:
            policyMode === 'token'
              ? {
                  contractAddress: tokenContractAddress.trim(),
                  licenseId: Number.parseInt(tokenLicenseId, 10) || 0,
                  requiredScope: tokenRequiredScope.trim() || undefined,
                }
              : undefined,
          purpose,
        },
        { network: session.network },
      )
      if (!res.ok) {
        setAllocateOut(res.error)
        return
      }
      const nextVaultId = String(res.data?.vaultId || '')
      if (nextVaultId) {
        setVaultId(nextVaultId)
        setLookupVaultId(nextVaultId)
      }
      refreshTxLog()
      setAllocateOut(JSON.stringify(res.data, null, 2))
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }

  const runEncryptStore = async () => {
    if (!requireWallet(setStoreOut)) return
    const id = (vaultId || '').trim()
    if (!id) {
      setStoreOut('Allocate (or enter) a vault id first.')
      return
    }
    setBusy(true)
    setActiveAction('encrypt-store')
    setStoreOut('')
    setStoreLinks([])
    try {
      let payloadFileBody: { name: string; type: string; base64: string } | undefined
      let fileMetadataBody:
        | { nftStyle: boolean; name: string; description: string; tags: string[] }
        | undefined
      if (payloadMode === 'file') {
        if (!payloadFile) {
          setStoreOut('Choose a file to upload.')
          return
        }
        const bytes = new Uint8Array(await payloadFile.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
        payloadFileBody = {
          name: payloadFile.name,
          type: payloadFile.type || 'application/octet-stream',
          base64: btoa(binary),
        }
        fileMetadataBody = {
          nftStyle: enableNftMetadata,
          name: metadataName.trim() || payloadFile.name,
          description: metadataDescription.trim(),
          tags: metadataTags
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }
      }
      const res = await apiPost<unknown>(
        `/api/cdr/vaults/${encodeURIComponent(id)}/encrypt-store`,
        session.role,
        session.wallet,
        {
          contentType: assetType,
          payloadText: payloadMode === 'text' ? payloadText : undefined,
          payloadFile: payloadFileBody,
          fileMetadata: fileMetadataBody,
          purpose,
          policyType: policyType.trim() || selectedTemplate.policyType,
        },
        { network: session.network },
      )
      if (!res.ok) {
        setStoreOut(res.error)
        return
      }
      refreshTxLog()
      setStoreLinks(collectStorageLinks(res.data))
      setStoreOut(JSON.stringify(res.data, null, 2))
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }

  const runAccessRequest = async () => {
    if (!requireWallet(setAccessOut)) return
    const id = (vaultId || '').trim()
    if (!id) {
      setAccessOut('Allocate (or enter) a vault id first.')
      return
    }
    setBusy(true)
    setActiveAction('request-access')
    setAccessOut('')
    try {
      const reqRes = await apiPost<unknown>(
        `/api/cdr/vaults/${encodeURIComponent(id)}/request-access`,
        session.role,
        session.wallet,
        { requesterRole: session.role, requesterWallet: session.wallet, purpose },
        { network: session.network },
      )
      if (!reqRes.ok) {
        setAccessOut(reqRes.error)
        return
      }
      const recRes = await apiPost<unknown>(
        `/api/cdr/vaults/${encodeURIComponent(id)}/recover`,
        session.role,
        session.wallet,
        { purpose },
        { network: session.network },
      )
      if (!recRes.ok) {
        setAccessOut(recRes.error)
        return
      }
      refreshTxLog()
      setAccessOut(JSON.stringify({ request: reqRes.data, recovery: recRes.data }, null, 2))
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }

  const runLicenseCheck = async () => {
    if (!requireWallet(setLicenseOut)) return
    setBusy(true)
    setActiveAction('license-check')
    setLicenseOut('')
    try {
      const res = await apiPost<unknown>(
        '/api/cdr/licenses/check',
        session.role,
        session.wallet,
        {
          holder: session.wallet,
          contractAddress: tokenContractAddress.trim(),
          licenseId: Number.parseInt(tokenLicenseId, 10) || 0,
          requiredScope: tokenRequiredScope.trim() || undefined,
        },
        { network: session.network },
      )
      if (!res.ok) {
        setLicenseOut(res.error)
        return
      }
      setLicenseOut(JSON.stringify(res.data, null, 2))
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }

  const runIssueLicense = async () => {
    if (!requireWallet(setLicenseOut)) return
    setBusy(true)
    setActiveAction('license-issue')
    setLicenseOut('')
    try {
      const res = await apiPost<{ licenseId?: number }>(
        '/api/cdr/licenses/issue',
        session.role,
        session.wallet,
        {
          holder: session.wallet,
          contractAddress: tokenContractAddress.trim(),
          scope: tokenRequiredScope.trim() || 'NIHR_APPROVED',
          expiresInDays: 30,
        },
        { network: session.network },
      )
      if (!res.ok) {
        setLicenseOut(res.error)
        return
      }
      if (typeof res.data?.licenseId === 'number' && res.data.licenseId > 0) {
        setTokenLicenseId(String(res.data.licenseId))
      }
      refreshTxLog()
      setLicenseOut(JSON.stringify(res.data, null, 2))
    } finally {
      setBusy(false)
      setActiveAction('')
    }
  }

  const fetchVault = async () => {
    const id = (lookupVaultId || vaultId || '').trim()
    if (!id) {
      setVaultOut('Enter a vault id to fetch.')
      setVaultLinks([])
      return
    }
    const res = await apiGet<unknown>(`/api/cdr/vaults/${encodeURIComponent(id)}`, session.role, session.wallet, {
      network: session.network,
    })
    setVaultLinks(res.ok ? collectStorageLinks(res.data) : [])
    setVaultOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
  }

  const fetchAudit = async () => {
    const id = (lookupVaultId || vaultId || '').trim()
    const path = id ? `/api/cdr/audit?vaultId=${encodeURIComponent(id)}` : '/api/cdr/audit'
    const res = await apiGet<unknown>(path, session.role, session.wallet, { network: session.network })
    setAuditLinks(res.ok ? collectStorageLinks(res.data) : [])
    setAuditOut(res.ok ? JSON.stringify(res.data, null, 2) : res.error)
  }

  return (
    <section className="grid">
      <article className="card">
        <h2>CDR (Confidential Data Rails)</h2>
        <p className="note">
          Story-inspired Confidential Data Rails flow for confidential text/file unlock. Arc Testnet + USDC x402 for
          paid lifecycle actions.
        </p>
        <p className="note">
          {CDR_NOTE} Active path: <strong>{payLabel}</strong>. Ticket: <strong>USDC {NEIGHBOURHOOD_X402_PRICE_DISPLAY}</strong>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="x402-fac-cdr" className="note">
            Provider
          </label>
          <select
            id="x402-fac-cdr"
            value={x402Provider}
            onChange={(e) => onX402ProviderChange(e.target.value as X402FacilitatorId)}
          >
            <option value="circle">Circle Gateway (batch + deposit)</option>
            <option value="thirdweb">Thirdweb (EIP-3009 exact)</option>
          </select>
        </div>
      </article>

      <article className="card">
        <h2>Policy template</h2>
        <label>
          Template
          <select
            value={templateId}
            onChange={(e) => {
              const next = POLICY_TEMPLATES.find((t) => t.id === e.target.value)
              setTemplateId(e.target.value)
              if (!next) return
              setPolicyType(next.policyType)
              setPolicyMode(next.mode)
              setPayloadText(next.payload)
            }}
          >
            {POLICY_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Policy type
          <input value={policyType} onChange={(e) => setPolicyType(e.target.value)} placeholder="e.g. Neighbourhood Health" />
        </label>
        <label>
          Policy mode
          <select value={policyMode} onChange={(e) => setPolicyMode(e.target.value as PolicyMode)}>
            <option value="allowlist">Merkle allowlist</option>
            <option value="owner">Owner only</option>
            <option value="token">Token / licence gate</option>
            <option value="open">Open (demo only)</option>
          </select>
        </label>
        <label>
          {policyMode === 'token' ? 'Condition contract address' : 'Condition ref / root (optional)'}
          <input
            value={policyMode === 'token' ? tokenContractAddress : allowlistRoot}
            onChange={(e) => {
              if (policyMode === 'token') setTokenContractAddress(e.target.value)
              else setAllowlistRoot(e.target.value)
            }}
            placeholder={policyMode === 'token' ? 'e.g. 0xLicenseConditionAddress' : 'e.g. 0xmerkle_root_or_policy_ref'}
          />
        </label>
        {policyMode === 'token' ? (
          <>
            <label>
              License id
              <input value={tokenLicenseId} onChange={(e) => setTokenLicenseId(e.target.value)} placeholder="e.g. 1" />
            </label>
            <label>
              Required scope (optional)
              <input
                value={tokenRequiredScope}
                onChange={(e) => setTokenRequiredScope(e.target.value)}
                placeholder="e.g. NIHR_APPROVED"
              />
            </label>
            <p className="note">
              Token/license mode checks Arc testnet contract authorization during access and recovery.
            </p>
            <div className="actions">
              <button type="button" className="secondary" disabled={!session.wallet || busy} onClick={() => void runLicenseCheck()}>
                Check license (current wallet)
              </button>
              <button type="button" className="secondary" disabled={!session.wallet || busy} onClick={() => void runIssueLicense()}>
                Issue starter license (current wallet)
              </button>
              {busy && (activeAction === 'license-check' || activeAction === 'license-issue') ? (
                <p className="note">Running...</p>
              ) : null}
            </div>
            <pre className="log">{licenseOut}</pre>
          </>
        ) : null}
      </article>

      <article className="card">
        <h2>Paid: allocate vault</h2>
        <label>
          Purpose of use
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. care_coordination" />
        </label>
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runAllocate()}>
            Allocate vault ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'allocate' ? <p className="note">Running...</p> : null}
        </div>
        <pre className="log">{allocateOut}</pre>
      </article>

      <article className="card">
        <h2>Paid: encrypt and store</h2>
        <label>
          Vault id
          <input value={vaultId} onChange={(e) => setVaultId(e.target.value)} placeholder="e.g. cdr_vault_..." />
        </label>
        <label>
          Content type
          <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>
            <option value="clinical_note_json">clinical_note_json</option>
            <option value="care_plan_json">care_plan_json</option>
            <option value="population_metrics_json">population_metrics_json</option>
            <option value="file_pointer">file_pointer</option>
          </select>
        </label>
        <label>
          Payload mode
          <select value={payloadMode} onChange={(e) => setPayloadMode(e.target.value as PayloadMode)}>
            <option value="text">Demo plaintext</option>
            <option value="file">Upload file (Pinata IPFS)</option>
          </select>
        </label>
        {payloadMode === 'file' ? (
          <>
            <label>
              File upload
              <input
                type="file"
                onChange={(e) => {
                  const next = e.target.files?.[0] || null
                  setPayloadFile(next)
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={enableNftMetadata}
                onChange={(e) => setEnableNftMetadata(e.target.checked)}
              />
              Create NFT-style metadata JSON (token URI compatible)
            </label>
            <label>
              Metadata name
              <input value={metadataName} onChange={(e) => setMetadataName(e.target.value)} />
            </label>
            <label>
              Metadata description
              <input value={metadataDescription} onChange={(e) => setMetadataDescription(e.target.value)} />
            </label>
            <label>
              Metadata tags (comma-separated)
              <input value={metadataTags} onChange={(e) => setMetadataTags(e.target.value)} />
            </label>
          </>
        ) : null}
        <label>
          Payload (demo plaintext)
          <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} rows={9} disabled={payloadMode !== 'text'} />
        </label>
        {payloadMode === 'file' ? (
          <p className="note">Selected file: {payloadFile ? `${payloadFile.name} (${payloadFile.size} bytes)` : 'none'}</p>
        ) : null}
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runEncryptStore()}>
            Encrypt & store ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'encrypt-store' ? <p className="note">Running...</p> : null}
        </div>
        {storeLinks.length ? (
          <p className="note">
            Storage links:{' '}
            {storeLinks.map((item, idx) => {
              const fallback = toGatewayFallback(item.url)
              return (
                <span key={`${item.label}-${item.url}`}>
                  {idx > 0 ? ' | ' : ''}
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                  {fallback ? (
                    <>
                      {' '}
                      (<a href={fallback} target="_blank" rel="noreferrer">gateway</a>)
                    </>
                  ) : null}
                </span>
              )
            })}
          </p>
        ) : null}
        <pre className="log">{storeOut}</pre>
      </article>

      <article className="card">
        <h2>Paid: request access + recover</h2>
        <p className="note">
          Simulates request approval, cooperative partial collection, and decryption recovery sequence.
        </p>
        <div className="actions">
          <button type="button" disabled={!session.wallet || busy} onClick={() => void runAccessRequest()}>
            Request access + recover ({NEIGHBOURHOOD_X402_PRICE_DISPLAY})
          </button>
          {busy && activeAction === 'request-access' ? <p className="note">Running...</p> : null}
        </div>
        <pre className="log">{accessOut}</pre>
      </article>

      <article className="card">
        <h2>Read vault + audit</h2>
        <label>
          Vault id for read APIs
          <input value={lookupVaultId} onChange={(e) => setLookupVaultId(e.target.value)} placeholder="optional if already allocated" />
        </label>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => void fetchVault()}>
            GET /api/cdr/vaults/:vaultId
          </button>
          <button type="button" className="secondary" onClick={() => void fetchAudit()}>
            GET /api/cdr/audit
          </button>
        </div>
        {vaultLinks.length ? (
          <p className="note">
            Vault links:{' '}
            {vaultLinks.map((item, idx) => {
              const fallback = toGatewayFallback(item.url)
              return (
                <span key={`${item.label}-${item.url}`}>
                  {idx > 0 ? ' | ' : ''}
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                  {fallback ? (
                    <>
                      {' '}
                      (<a href={fallback} target="_blank" rel="noreferrer">gateway</a>)
                    </>
                  ) : null}
                </span>
              )
            })}
          </p>
        ) : null}
        {auditLinks.length ? (
          <p className="note">
            Audit links:{' '}
            {auditLinks.map((item, idx) => {
              const fallback = toGatewayFallback(item.url)
              return (
                <span key={`${item.label}-${item.url}`}>
                  {idx > 0 ? ' | ' : ''}
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                  {fallback ? (
                    <>
                      {' '}
                      (<a href={fallback} target="_blank" rel="noreferrer">gateway</a>)
                    </>
                  ) : null}
                </span>
              )
            })}
          </p>
        ) : null}
        <pre className="log">{vaultOut}</pre>
        <pre className="log">{auditOut}</pre>
      </article>

      <article className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Transaction log (this page)</h2>
        <div className="actions" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="secondary" onClick={() => refreshTxLog()}>
            Refresh log
          </button>
          <div className="actions" role="group" aria-label="Filter by wallet mode">
            <button
              type="button"
              className={txModeFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => {
                setTxModeFilter('all')
                setTxPage(1)
              }}
            >
              All modes
            </button>
            <button
              type="button"
              className={txModeFilter === 'metamask' ? 'primary' : 'secondary'}
              onClick={() => {
                setTxModeFilter('metamask')
                setTxPage(1)
              }}
            >
              MetaMask
            </button>
            <button
              type="button"
              className={txModeFilter === 'circle' ? 'primary' : 'secondary'}
              onClick={() => {
                setTxModeFilter('circle')
                setTxPage(1)
              }}
            >
              Circle
            </button>
          </div>
        </div>
        {filteredTxRows.length === 0 ? (
          <p className="note">No paid CDR calls recorded yet.</p>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Mode</th>
                  <th>Endpoint</th>
                  <th>Ref / tx</th>
                  <th>Explorer</th>
                </tr>
              </thead>
              <tbody>
                {txPageRows.map((row) => {
                  const txLink = explorerUrl(row.network, row.txHash)
                  const refLabel =
                    row.txHash.length > 22 ? `${row.txHash.slice(0, 10)}…${row.txHash.slice(-8)}` : row.txHash
                  return (
                    <tr key={`${row.txHash}-${row.createdAt}-${row.endpoint}`}>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>
                        {row.walletMode === 'circle' ? (
                          <span className="tx-badge tx-badge--chain">Circle</span>
                        ) : row.walletMode === 'metamask' ? (
                          <span className="tx-badge tx-badge--audit">MetaMask</span>
                        ) : (
                          <span className="tx-badge">Unknown</span>
                        )}
                      </td>
                      <td>
                        <code>{row.endpoint}</code>
                      </td>
                      <td title={row.auditRef ? `auditRef: ${row.auditRef}` : row.txHash}>
                        <code>{refLabel}</code>
                      </td>
                      <td>
                        {txLink ? (
                          <a href={txLink} target="_blank" rel="noreferrer">
                            View tx
                          </a>
                        ) : walletExplorer ? (
                          <a href={walletExplorer} target="_blank" rel="noreferrer">
                            Wallet on explorer
                          </a>
                        ) : (
                          <span className="note">n/a</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}

export default function NhsCdrApp() {
  const [x402Provider, setX402Provider] = useState<X402FacilitatorId>(() => getX402FacilitatorPreference())
  const payLabel = x402Provider === 'thirdweb' ? 'thirdweb x402' : 'Circle Gateway x402'

  return (
    <NhsShell
      title="CDR (Confidential Data Rails)"
      subtitle="Confidential text/file unlock workflows on Arc Testnet + USDC x402, using policy-aware vault lifecycle demos."
    >
      {(session) => (
        <NhsCdrGrid
          key={session.network}
          session={session}
          payLabel={payLabel}
          x402Provider={x402Provider}
          onX402ProviderChange={(v) => {
            setX402FacilitatorPreference(v)
            setX402Provider(v)
          }}
        />
      )}
    </NhsShell>
  )
}
