# OpenClaw Clinical Hackathon: Build Learnings

## Disclaimer

This project and all examples are for hackathon/prototyping only.  
Use **dummy/synthetic patient data only**.  
Do **not** use real patient-identifiable or sensitive clinical data.

## Context

These notes summarize practical lessons from rewriting a Tempo/x402 app into NHS-aligned use cases:

- GP access front door
- Personalized care plans
- Social prescribing referral and link-worker flow
- Neighbourhood team coordination
- Remote monitoring and proactive alerts
- Wallet-authenticated x402 payments on Arc testnet/mainnet

Aligned references:

- [NHS 10 Year Health Plan (executive summary)](https://www.gov.uk/government/publications/10-year-health-plan-for-england-fit-for-the-future/fit-for-the-future-10-year-health-plan-for-england-executive-summary)
- [NHS London Neighbourhood Health Service](https://www.england.nhs.uk/london/our-work/a-neighbourhood-health-service-for-london/)
- [NHS England Social Prescribing](https://www.england.nhs.uk/personalisedcare/social-prescribing/)

## What Worked Well (Successes)

1. **Start with workflows, not code.**  
   Mapping concrete user journeys first (patient, GP, neighbourhood provider) kept scope focused and avoided overbuilding.

2. **Separate domain logic from payment plumbing.**  
   Putting NHS routes/model code in a dedicated module and keeping x402 handling reusable reduced complexity and made role rules clearer.

3. **Role-based authorization early.**  
   Enforcing `patient`, `gp`, `nhc_provider` from day one prevented accidental workflow leaks and clarified expected behavior.

4. **Simple production-like persistence beats mocks quickly.**  
   Moving from in-memory state to SQLite with explicit entities and audit rows made testing repeatable and reliable.

5. **Transaction audit visibility increased trust.**  
   Capturing tx hashes and exposing testnet/mainnet transaction views improved operability and demo confidence.

6. **UX guardrails reduced user confusion.**  
   Disabled restricted actions + inline role hints prevented repeated "Forbidden for role" errors.

## Failures / Pitfalls

1. **Leaving role constraints only on backend initially.**  
   It is secure, but the UX feels broken unless the UI also explains restrictions.

2. **Assuming hot-reload always reflects latest permissions UX.**  
   Browser extension/provider scripts and stale reloads can make role-control changes seem inconsistent.

3. **Smoke tests failing when payment gate was always-on.**  
   CI/local smoke paths need an explicit non-wallet mode (`NHS_ENABLE_PAYMENT_GATE=false`) to validate core flows quickly.

4. **Route retirement can leave hidden technical debt.**  
   Removing old frontend routes without explicit migration docs can confuse collaborators unless documented clearly.

5. **Tx extraction only from one source is fragile.**  
   Payment metadata can appear in headers or payloads; robust audit needs multi-source extraction and safe fallbacks.

## Best Practices (Recommended for Participants)

1. **Use a clear boundary:**
   - `domain` (care logic)
   - `auth/rbac`
   - `payment gate`
   - `api transport`
   - `ui`

2. **Treat payment as a cross-cutting concern.**  
   Wrap write endpoints with a shared x402 gate rather than sprinkling payment logic route-by-route.

3. **Store immutable audit events for every write.**  
   Include actor role, wallet address, entity type, action, timestamp, and payment receipt/tx reference when present.

4. **Make role restrictions explicit in UI.**  
   Disable, label, and explain restricted actions before users submit.

5. **Keep testnet/mainnet explicit everywhere.**  
   Show current network in controls, payloads, and transaction audit pages.

6. **Run a deterministic smoke flow.**  
   Script identity -> GP request -> care plan -> social referral -> monitoring -> alert resolve.

7. **Use synthetic data conventions.**  
   Prefix IDs and sample values to prevent accidental interpretation as real records.

8. **Document operational toggles.**  
   Example: payment-gate toggle and wallet prerequisites for live x402 testing.

## How I Would Do It Differently Next Time

1. **Design system first.**  
   I would define reusable UI primitives (form row, role-guard banner, status panel, json viewer) before page-level implementation.

2. **Typed API contract generated once.**  
   I would generate frontend types from OpenAPI at the beginning to remove drift and reduce repetitive response typing.

3. **Payment gate policy matrix up front.**  
   I would define exactly which endpoints require x402 and expected fees in a single policy file from day one.

4. **Event-sourced audit model earlier.**  
   I would start with an explicit event table schema and project read models from it, instead of adding projections later.

5. **E2E browser tests for role + network permutations.**  
   I would add automated role/network matrix tests earlier to catch authorization UX mismatches fast.

6. **Feature flags for migration periods.**  
   During major rewrites, I would use explicit feature flags so legacy and new paths can coexist briefly and safely.

## Practical Checklist for Hackathon Teams

- [ ] Keep all data synthetic (no real patient data)
- [ ] Define role permissions before coding pages
- [ ] Build one reusable x402 route wrapper
- [ ] Add transaction logging and explorer links from day one
- [ ] Implement one happy-path smoke script
- [ ] Add role-aware UI disabling and hints
- [ ] Verify both Arc testnet and mainnet selectors
- [ ] Write a short runbook for setup and troubleshooting

## Final Safety Note

This repository is for innovation and demonstration in a hackathon context.  
Do not connect real clinical systems or ingest real patient records without appropriate governance, legal basis, and security controls.

## Session Update (NHS UK Dataset Lane + x402 Debug)

1. **Data-source mismatch can look like search failure.**  
   The NHS UK lane initially called HES scale endpoints, so terms present in NHS UK CSVs (for example "blood pressure") returned zero rows. Fixing endpoint/data-source alignment immediately resolved the confusion.

2. **Separate "payment success" from "data relevance" in UX.**  
   A paid call can succeed (x402 settled, HTTP 200) while still returning empty rows due to query/dataset mismatch. Show both payment result and dataset provenance clearly.

3. **Runtime logs beat assumptions for x402 latency.**  
   Instrumentation around client fetch, facilitator settlement, and handler execution quickly isolated where time was spent and avoided speculative fixes.

4. **Use dedicated endpoints per dataset family.**  
   Adding a CSV-backed `/api/neighbourhood/uk/search` route for NHS UK generated datasets prevents accidental coupling with HES FTS/search semantics.

5. **Keep payment gate behavior consistent across new routes.**  
   New paid endpoints must be wired in both server gate wrappers and facilitator middleware to avoid inconsistent challenge/settlement behavior.

6. **Operationally, hot restarts are part of debugging discipline.**  
   Restarting `npm run dev:full` after route/middleware changes prevented stale assumptions during iterative testing.

7. **Align synthesis and retrieval to the same dataset lane.**  
   If retrieval uses NHS UK OpenGPT CSV sources, synthesis should also ground on those same sources; mixing HES synthesis with NHS UK retrieval creates confusing, inconsistent outputs.

8. **Remove irrelevant inherited fields during route migrations.**  
   The `LSOA filter` made sense for HES aggregate routes but not for NHS UK CSV synthesis. Removing legacy inputs improves UX clarity and prevents payload drift.

9. **Precision controls improve controllability for demo prompts.**  
   Adding `content focus`, `audience`, and `context rows` fields produced more targeted synthesis output and made behavior easier to explain to judges and reviewers.

10. **Facilitator wiring must cover every paid route family.**  
   dm+d paid routes initially failed with `invalid_signature` in MetaMask + Thirdweb mode because the Thirdweb settlement middleware path did not include `/api/dmd/*`. Explicitly wiring dm+d paid endpoints into facilitator resolution + settlement middleware removed the mismatch.

11. **Place paid outputs beside paid actions for better operator UX.**  
   Users expect paid lookup results directly under the paid lookup card; splitting free and paid output panes reduces scrolling and avoids confusion about which action produced which response.

## Session Update (CDR Rollout: Arc + USDC)

1. **Route discovery must be updated in three places, not one.**  
   Adding a new NHS feature lane required synchronized updates in `src/main.tsx` routing, `src/hubRoutes.ts` hub cards, and `src/NhsShell.tsx` top navigation/context labels.

2. **Keep CDR lifecycle deterministic first, then integrate real cryptography later.**  
   A mocked in-memory backend (`/api/cdr`) with explicit state transitions (`allocated -> sealed -> access_pending -> recovered/revoked`) provided reliable UX and testability before Story/CDR SDK integration.

3. **Payment alignment for new route families must happen on both resolver and settlement layers.**  
   CDR paid endpoints needed explicit inclusion in `server/x402FacilitatorContext.js` and `server/thirdwebX402.js` to avoid the same facilitator mismatch class previously seen on dm+d routes.

4. **Treat variable route segments as endpoint families in tx history.**  
   Client transaction logs should normalize dynamic paths (`/api/cdr/vaults/:vaultId/...`) so paginated logs and cost labels remain accurate regardless of generated vault IDs.

5. **OpenAPI discoverability reduces integration drift.**  
   Declaring all CDR lifecycle endpoints in `server/openapi.mjs` keeps `/openapi.json` aligned with the runnable API and makes agent/service discovery easier during demos.

## Session Update (CDR Token/License Contract on Arc)

1. **Token policy mode needs contract checks, not labels.**  
   Keeping `policyMode=token` as a string-only marker is not sufficient. Adding an Arc testnet `LicenseCondition` contract made access decisions deterministic and auditable.

2. **Separate payment settlement from authorization outcomes.**  
   A paid request can still be denied by policy. We now return explicit authorization reasons (`license_missing`, `license_expired`, `license_revoked`, `requester_not_holder`, `scope_mismatch`) so operators can debug without conflating x402 and policy errors.

3. **Defense-in-depth on both access and recovery steps.**  
   Re-checking token authorization during `recover` (not only `request-access`) protects against stale approvals and license revocation timing gaps.

4. **Structured token payloads beat generic condition refs.**  
   Upgrading UI payloads from free-text `conditionRef` to `{contractAddress, licenseId, requiredScope}` reduced operator error and made backend validation straightforward.

5. **Hardhat bootstrap is enough for Arc testnet experimentation.**  
   Minimal `hardhat` + deploy/seed scripts provided fast contract iteration without introducing a second repository.

## Session Update (Circle wallet onboarding + Pinata IPFS)

1. **Circle wallet and MetaMask need wallet-specific licenses.**  
   License authorization is holder-specific. A license issued to MetaMask will not automatically authorize Circle wallet mode.

2. **One-click license issuance removes onboarding friction.**  
   Adding CDR endpoints (`/api/cdr/licenses/check`, `/api/cdr/licenses/issue`) plus UI buttons made it easy for new users to self-check and issue starter licenses for the active wallet.

3. **Surface explicit authorization reasons in UI.**  
   Showing `requester_not_holder`, `license_missing`, and `scope_mismatch` style messages in human-readable form reduced debugging time significantly.

4. **File uploads should support both gateway and native IPFS URIs.**  
   Returning `gatewayUrl` and `ipfs://` URIs for file and metadata objects makes downstream smart-contract/token-metadata integration easier.

5. **NFT-style metadata is useful even in non-NFT demos.**  
   Optional token URI-compatible metadata JSON on Pinata gives interoperability with wallet/indexer tooling without changing the core CDR model.

6. **Env-dependent integrations need immediate operator feedback.**  
   Missing `PINATA_JWT` should fail fast with a direct message so teams know it is configuration, not payload or network failure.

## Session Update (x1/x50 On-chain Runner)

1. **Dedicated proof tooling removes ambiguity.**  
   A separate `/nhs/onchain-runner` flow is clearer than relying on mixed traffic in feature pages when judges ask for explicit "50+ on-chain tx" evidence.

2. **Gate bulk runs behind a successful smoke test.**  
   Requiring x1 success before x50 catches wallet/signature/funding issues early and avoids wasting retries.

3. **Separate strict on-chain proof from nanopayment economics.**  
   Direct wallet transactions give deterministic per-attempt explorer hashes. Circle x402 nanopayment runs should be judged on paid-call success plus batched settlement evidence, not forced 1:1 tx hashes per HTTP call.

4. **Sequential execution is easier to audit than parallel bursts.**  
   Running one paid call at a time (`await` per attempt) makes logs deterministic and allows exact attempt-to-hash mapping.

5. **Exportable proof artifacts save demo time.**  
   A local JSON export of attempt index + tx hash + explorer URL gives an immediate handoff artifact for judges and teammates.

6. **Operator-friendly history controls matter.**  
   Split **clear screen** vs **delete stored history**, add **import attempts JSON** for restoring exports, and paginate large attempt lists so demos stay readable.

## Session Update (Dual-mode Nanopayments Runner)

1. **One runner should demonstrate two truths, not one.**  
   Keep a strict direct on-chain lane for tx-per-attempt proof, and a Circle x402 lane for nanopayment economics and batched settlement behavior.

2. **Paid-call evidence and settlement evidence must be separated.**  
   In x402 mode, log each paid request attempt even when no per-request tx hash is returned, then report observed chain settlements separately.

3. **Batch controls make demo evidence repeatable.**  
   Exposing `batch size` and `batch count` (recommended 10 x 5) provides predictable total volume and reproducible output.

4. **Sequential execution still matters in batch narratives.**  
   Running requests one-by-one preserves deterministic logs, while settlement can still appear in fewer on-chain transactions.

5. **Export both granular and aggregate artifacts.**  
   Use per-attempt JSON (`runner-attempts`) and aggregate summary JSON (`runner-summary`) so judges can validate both request-level and settlement-level claims.

## Session Update (dm+d UI dataset label)

1. **Do not hardcode operator-specific filesystem paths in React.**  
   Showing `/Users/.../Downloads/...` in the UI breaks for every other machine; prefer live server metadata (`/api/dmd/health` upstream URL or configuration hint).

2. **Keep large TRUD extracts out of git.**  
   Use a gitignored `data/` directory or external volume and document `DMD_SERVICE_URL` in runbooks instead of committing multi-gigabyte drops.
