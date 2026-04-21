import NhsShell from './NhsShell'

export default function NhsHubApp() {
  return (
    <NhsShell
      title="Agentic Hackathon Arc"
      subtitle="OpenEHR (EHRbase) + synthetic artificial HES + SNOMED CT references + Arc Testnet USDC nanopayments (x402). Demo only — not for clinical use."
    >
      {() => (
        <section className="grid hub-grid">
          <article className="card card--hero" style={{ gridColumn: '1 / -1' }}>
            <h2>Start here</h2>
            <ol className="hub-steps">
              <li>
                <strong>Wallet</strong> — connect above. Balances update automatically (refresh if needed).
              </li>
              <li>
                <strong>Funds</strong> — use <em>Get testnet funds</em> (Circle faucet for Arc). Wallet USDC appears in
                the green bar; deposit to Gateway when the app asks for x402 batch payments.
              </li>
              <li>
                <strong>Demo</strong> — open the neighbourhood health plan for paid OpenEHR AQL, HES aggregates, and
                SNOMED tools.
              </li>
            </ol>
            <div className="hub-cta">
              <a className="button-like hub-cta__primary" href="/nhs/neighbourhood-insights">
                Go to neighbourhood health plan →
              </a>
              <p className="note hub-cta__note">Paid actions need a connected wallet and USDC on Arc testnet.</p>
            </div>
          </article>
        </section>
      )}
    </NhsShell>
  )
}
