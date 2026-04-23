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
