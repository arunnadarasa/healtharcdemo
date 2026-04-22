import { useMemo, useState } from 'react'
import NhsShell from './NhsShell'
import {
  clearNhsTxHistory,
  explorerAddressUrl,
  explorerUrl,
  listNhsTxHistory,
  paidDisplayForNeighbourhoodEndpoint,
  type NhsTxItem,
  type WalletMode,
} from './nhsTxHistory'
import type { NhsNetwork, NhsRole } from './nhsSession'
import { getStoredWallet } from './nhsSession'

type Session = { role: NhsRole; wallet: string; network: NhsNetwork }
type TxModeFilter = 'all' | WalletMode

/** Clickable href for the transaction reference: Arc /tx/ page (on-chain) or in-app deep link (audit). */
function transactionReferenceLink(row: NhsTxItem): { href: string; external: boolean } | null {
  const chain = explorerUrl(row.network, row.txHash)
  if (chain) return { href: chain, external: true }
  if (
    row.auditRef?.startsWith('gpr_') &&
    row.endpoint.includes('gp-access') &&
    !row.endpoint.includes('/gp-access/requests/')
  ) {
    return {
      href: `/nhs/gp-access?requestId=${encodeURIComponent(row.auditRef)}`,
      external: false,
    }
  }
  return null
}

function TransactionsTable({ session }: { session: Session }) {
  const [rows, setRows] = useState<NhsTxItem[]>(() => listNhsTxHistory())
  const [txModeFilter, setTxModeFilter] = useState<TxModeFilter>('all')

  const wallet = session.wallet || getStoredWallet()

  const tab = session.network
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (row.network !== tab) return false
        if (txModeFilter === 'all') return true
        return row.walletMode === txModeFilter
      }),
    [rows, tab, txModeFilter],
  )

  return (
    <section className="grid">
      <article className="card">
        <h2>Transaction history</h2>
        <p className="note tx-note-tight">
          Showing <strong>{tab}</strong> rows (matches header network). <strong>On-chain</strong> rows include a <code>/tx/…</code> link after a successful x402 payment. <strong>Audit</strong> rows only record the request; use <strong>Wallet on explorer</strong> to open your address and find the payment in the list — there is no per-row tx hash without a wallet-paid flow.
        </p>
        <div className="actions">
          <button className="secondary" onClick={() => setRows(listNhsTxHistory())}>
            Refresh
          </button>
          <button
            className={txModeFilter === 'all' ? 'primary' : 'secondary'}
            onClick={() => setTxModeFilter('all')}
          >
            All modes
          </button>
          <button
            className={txModeFilter === 'metamask' ? 'primary' : 'secondary'}
            onClick={() => setTxModeFilter('metamask')}
          >
            MetaMask
          </button>
          <button
            className={txModeFilter === 'circle' ? 'primary' : 'secondary'}
            onClick={() => setTxModeFilter('circle')}
          >
            Circle
          </button>
          <button
            className="secondary"
            onClick={() => {
              clearNhsTxHistory()
              setRows([])
            }}
            disabled={rows.length === 0}
          >
            Clear all
          </button>
        </div>
        {filtered.length === 0 ? (
          <p className="note">
            No {tab} transactions recorded yet. Successful NHS writes (with on-chain receipt or local audit) appear here.
          </p>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Mode</th>
                  <th>Endpoint</th>
                  <th>Type</th>
                  <th>Cost (list)</th>
                  <th>Reference</th>
                  <th>Explorer</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const kind = row.kind ?? (row.txHash.startsWith('0x') ? 'chain' : 'audit')
                  const link = explorerUrl(row.network, row.txHash)
                  const refLabel =
                    kind === 'audit' && row.auditRef
                      ? row.auditRef
                      : row.txHash.length > 22
                        ? `${row.txHash.slice(0, 10)}…${row.txHash.slice(-8)}`
                        : row.txHash
                  const refLink = transactionReferenceLink(row)
                  const walletExplorer = explorerAddressUrl(row.network, wallet)
                  const costDisplay = row.paidDisplay ?? paidDisplayForNeighbourhoodEndpoint(row.endpoint) ?? '—'
                  return (
                    <tr key={`${row.txHash}-${row.createdAt}`}>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>
                        {row.walletMode === 'circle' ? (
                          <span className="tx-badge tx-badge--chain">Circle</span>
                        ) : row.walletMode === 'metamask' ? (
                          <span className="tx-badge tx-badge--audit">MetaMask</span>
                        ) : (
                          <span className="tx-muted">—</span>
                        )}
                      </td>
                      <td>
                        <code>{row.endpoint}</code>
                      </td>
                      <td>
                        <span className={kind === 'chain' ? 'tx-badge tx-badge--chain' : 'tx-badge tx-badge--audit'}>
                          {kind === 'chain' ? 'On-chain' : 'Audit'}
                        </span>
                      </td>
                      <td title="Listed gate price when known (audit rows use the same list price as on-chain)">
                        {costDisplay}
                      </td>
                      <td>
                        {refLink ? (
                          <a
                            href={refLink.href}
                            title={row.txHash}
                            {...(refLink.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                          >
                            <code>{refLabel}</code>
                          </a>
                        ) : (
                          <code title={row.txHash}>{refLabel}</code>
                        )}
                      </td>
                      <td className="tx-explorer-cell">
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer" title="Arc transaction detail">
                            View transaction
                          </a>
                        ) : (
                          <>
                            {walletExplorer ? (
                              <a
                                href={walletExplorer}
                                target="_blank"
                                rel="noreferrer"
                                title="Your wallet on Arc explorer — find the payment in the transactions list (audit rows do not store a tx hash)."
                              >
                                Wallet on explorer
                              </a>
                            ) : (
                              <span className="tx-muted">Connect wallet</span>
                            )}
                            {refLink && !refLink.external ? (
                              <>
                                {' '}
                                <span className="tx-muted">·</span>{' '}
                                <a href={refLink.href}>In app</a>
                              </>
                            ) : null}
                          </>
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

export default function NhsTransactionsApp() {
  return (
    <NhsShell
      title="Transactions Audit"
      subtitle="On-chain rows link the Arc transaction page (/tx/0x…). Audit rows have no stored tx hash; use Wallet on explorer to open your address and locate the payment. Use x402 + payment gate for per-request /tx/ links."
    >
      {(session) => <TransactionsTable session={session} />}
    </NhsShell>
  )
}
