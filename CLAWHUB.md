# ClawHub Learning Notes (Clinical Arc / HealthTech Protocol)

## LLM context bundle (`llm-full.txt`)

For **full-repo orientation** in one paste (ChatGPT, Claude, Cursor, OpenClaw): use **`public/llm-full.txt`**, built from README + this file + `HEALTHTECH_USE_CASES.md` + `HEALTH_TECH_PROTOCOL_AZ.md` + **`docs/ARC_X402_NOTES.md`** + **`docs/OPENAPI_DISCOVERY.md`** (when present).

**Published skill (ClawHub):** [clawhub.ai/arunnadarasa/clinicalarc](https://clawhub.ai/arunnadarasa/clinicalarc) — install the Clinical Arc skill for IDE/OpenClaw; source of truth remains **`.cursor/skills/clawhub/`** in git. **OpenClaw (optional):** `openclaw plugins install @anyway-sh/anyway-openclaw` — documented in **`references/openclaw-clinical-tempo.md`**. **Ecosystem framing:** optional **`docs/ECOSYSTEM_SYNERGY.md`** when present.

- **Regenerate:** `npm run build:llm` (runs automatically before `npm run build`).
- **In the browser:** open **`/llm-full.txt`** or use the hub **“Download LLM context bundle”** button on `/`.
- **In GitHub (raw `llm-full.txt`):** `https://raw.githubusercontent.com/arunnadarasa/clinicalarc/main/public/llm-full.txt`

Keep **this file (`CLAWHUB.md`)** for debugging checklists and failures; pair it with `llm-full.txt` when an agent needs both product context and tribal knowledge. For **EVVM** depth, use upstream **`https://www.evvm.info/llms-full.txt`** (not vendored here).

---

This is a “tribal knowledge” file for quickly onboarding OpenClaw (and any future agent) to the Clinical Arc repository:

- what the repo is (**HealthTech Protocol** reference stack on Arc + x402),
- what succeeded,
- what failed and why,
- and the repeatable best practices that prevent re-learning the hard parts.

---

## What this repo is

**HealthTech Protocol** (this repo’s framing) is the set of **interoperable payment + ops patterns** for **neighbourhood health and care coordination**—wallet identity, payment-gated service requests, care plans, referrals, monitoring, AgentMail/TIP-20 integrations—implemented with **Arc Testnet** settlement and **Circle Gateway x402** machine payments. **Legacy** event/dance demos (`/dance-extras`) use the same rails. Clinical Arc is the **reference superapp** that encodes those patterns in code.

Clinical Arc is built around:

- **Arc Testnet** (chain id 5042002) for nanopaid flows
- **x402** (client/server-side handling of `402 Payment Required` challenges)
- **Dedicated use-case routes** (hub + full-screen flows)
- A **Node/Express backend** that verifies x402 receipts and proxies/handles integrations.

Core docs to reuse:

- `README.md` (high-level “superapp” framing + route list)
- `HEALTHTECH_USE_CASES.md` (the flow-by-flow contract and API mappings)
- `server/index.js` (the real implementation patterns and integration edge handling)

---

## Successes (what worked)

1. **Arc + x402 on dance-extras live**  
   - `curl` to `http://127.0.0.1:8787/api/dance-extras/live/judge-score/testnet` returns **402** until a browser wallet completes payment via Circle Gateway on Arc.  
   - See **`docs/ARC_X402_NOTES.md`** and `/nhs/http-pay` for copy-paste examples.

2. **Superapp README now reflects the real architecture**
   - Added a “super app” definition that maps: hub vs dedicated routes vs backend vs integrations.
   - Included the dedicated route table so explanations don’t drift from implementation.
   - Documented quick start (`npm run server`, `npm run dev`, `npm run dev:full`) and environment guidance.

3. **GitHub push worked after unrelated-history + README conflict**
   - When the remote `main` already had commits, the first push failed (non-fast-forward).
   - Pulling unrelated histories caused a `README.md` conflict.
   - Resolution strategy: keep the README focused (short title/one-line description) and remove template bulk rather than trying to merge two incompatible README styles.

4. **AgentMail “email” flow got to a working end-to-end pattern**
   - Earlier attempts hit inbox scope mismatches (notably `Inbox not found`).
   - The final working approach:
     - the wallet pays **this backend** using **x402** (server charge),
     - then the backend sends the email via **AgentMail’s API key endpoint** (`AGENTMAIL_API_KEY`).
   - This preserves “wallet-paid UX” while avoiding fragile inbox scope behavior in passthrough mode.

5. **`/dance-extras` live x402 + shared server handler**
   - `POST /api/dance-extras/live/:flowKey/:network` runs the gateway gate then `executeDanceExtraFlow` so the seven core HealthTech scaffolds share one payment path.
   - `GET /api/dance-extras/live` returns `flowKeys` — use it to verify the running Node process actually has the route (see failure §5).

6. **AgentMail bot flow: always send `inbox_id`**
   - `/api/ops/agentmail/send` requires `inbox_id` (or `AGENTMAIL_INBOX_ID` on the server).
   - Demo default in the client: `streetkode@agentmail.to` via `src/agentmailDemo.ts` (`AGENTMAIL_DEMO_INBOX_ID`).

7. **OpenAPI discovery (`GET /openapi.json`)**
   - Express serves **OpenAPI 3.1** at **`/openapi.json`** (`server/openapi.mjs`) so agents can discover paid routes; **`DANCE_EXTRA_LIVE_AMOUNTS`** lives in **`openapi.mjs`** and is imported by **`server/index.js`** (single source of truth).
   - Validate with **`npm run discovery`** while **`npm run server`** is running on **8787**. See **`docs/OPENAPI_DISCOVERY.md`** when present.

8. **Server integration patterns are consistent**
   - For `402`-capable third-party endpoints:
     - if upstream returns `402`, the backend should pass that challenge back to the client (so `x402` can solve).
   - For “paid endpoints then poll” integrations:
     - use the correct auth header strategy for the paid + polling phases (x402 vs SIWX vs bearer-token style).

9. **NHS routes: extracting the on-chain reference after x402 settlement**
   - After the gateway verifies payment, the handler should surface a stable **`receiptRef`** / tx hash for audit — see **`server/nhs/payment.js`** (`resolvePaymentReceiptRef`) and **`server/nhs/router.js`**.
   - The client prefers **`payload.receiptRef`** in **`src/nhsApi.ts`** (`txFromResponse`) so **Transactions** can show **On-chain** rows.

10. **NHS `/nhs/tip20`: mint after factory create (`viem/tempo`)**  
   - Factory **`createSync`** sets **`admin`** to the connected wallet; **mint** requires **`ISSUER_ROLE`**, which is **not** granted automatically — check with **`Actions.token.hasRole`** (`role: 'issuer'`) and, if missing, **`grantRole`** on the token contract before **`Actions.token.mintSync`**.  
   - Prefer **`writeContractSync`** for a **single** `grantRole` call. **`Actions.token.grantRolesSync`** uses **`sendTransaction`** with batched `calls`, which on some chains can produce envelope type **`0x76`**; browser wallets + viem reject that path (`Invalid transaction envelope type: "0x76". Must be one of: 0x0, 0x1, 0x2, 0x4`).  
   - Misleading reverts (e.g. “gas limit too high”) can appear when mint is unauthorized — fix roles first, not gas.  
   - Implementation: **`src/tempoTip20Launch.ts`** (`mintTip20OnChain`), UI **`src/NhsTip20App.tsx`**.

---

## Failures (what broke) and how to recognize it

### 1) GitHub push: remote already had commits

**Symptom**
- Push rejected with a non-fast-forward error.

**Cause**
- The local repo history and remote `origin/main` history did not share a common base.

**Fix**
- Pull with `--allow-unrelated-histories`, resolve conflicts, then push.
- For docs conflicts, keep the README aligned to the repo’s current purpose instead of merging incompatible template text.

### 2) README merge conflicts

**Symptom**
- `README.md` conflict markers appeared after merging unrelated histories.

**Cause**
- A template README on the remote conflicted with the locally-generated template/short description.

**Fix**
- Prefer a single coherent README rather than trying to “merge” two styles.
- Keep the “superapp capability” content, route list, and setup instructions. Remove template bulk.

### 3) AgentMail: `Inbox not found` / inbox scope mismatch

**Symptom**
- AgentMail send returns an error indicating the inbox doesn’t exist or isn’t accessible.

**Common causes**
- `AGENTMAIL_INBOX_ID` not set and no `inbox_id` provided in the request body.
- Inbox ID mismatch vs the paid-scope the integration expects.
- Using passthrough wallet-paid mode while the integration expects a specific inbox access scope.

**Fix pattern that worked**
- If `AGENTMAIL_API_KEY` is available:
  - pay via x402 to this backend,
  - send via AgentMail stable API endpoint using the API key,
  - return the upstream result.

### 4) x402 mismatch and recurring `402` loops

**Symptom**
- The frontend repeatedly encounters `402` (or can’t recover from an auth challenge).

**Common causes**
- Hitting the wrong base URL for the x402-capable endpoint.
- Not preserving `402` challenge headers/body back to the `x402` client.
- Forwarding the wrong headers for the solved/authorized phase.

**Fix**
- Ensure the backend returns the upstream `402` response directly (not a generic error).
- Ensure “forwarding” of headers follows the solved payment stage (e.g. `payment`, `payment-receipt`).

### 5) `Cannot POST /api/dance-extras/live/...` (HTML 404)

**Symptom**
- Telemetry shows `Cannot POST /api/dance-extras/live/<flow>/<network>` (Express default 404 HTML).

**Cause**
- Vite proxies `/api` to `http://localhost:8787`, but the **Express process on 8787 is an old build** (started before the live route existed) or isn’t this repo’s `server/index.js`.

**Fix**
- Restart the API: stop the old `node` process, run `npm run server` or `npm run dev:full`.
- Verify: `GET http://localhost:8787/api/dance-extras/live` must return JSON with `flowKeys`. If that 404s, you’re still on the wrong/stale server.

### 6) AgentMail: `Missing inbox_id for AgentMail send`

**Symptom**
- `400` with `Missing inbox_id for AgentMail send` after bot-action + mail step.

**Cause**
- Request body omitted `inbox_id` and `AGENTMAIL_INBOX_ID` is unset on the server.

**Fix**
- Pass `inbox_id` in the JSON body (demo: `streetkode@agentmail.to`) and/or set `AGENTMAIL_INBOX_ID` in `.env`.
- For Bearer sends, still need `AGENTMAIL_API_KEY`.

### 7) Invalid payment parameters (e.g. `feeToken`, network, or amount format)

**Symptom**
- Payment failures that mention token/fee/address/chain inconsistencies.

**Common causes**
- Using the wrong chain network (testnet vs mainnet).
- Passing amount in base units when the `x402` chain method expects a decimal-string amount (see server implementation).
- Misconfigured recipients/fee tokens for a specific provider method.

**Fix**
- Keep `testnet` as the default for “first get it working” debugging.
- Match the backend chain method config:
  - `tempoModerato` chain for testnet-like flows
  - `tempo` chain for mainnet-like flows
- Use decimal-string amounts (server uses `toFixed(2)` in key payment handlers).

### 8) `/dance-extras/foo` loaded the hub instead of ExtraDanceApp

**Symptom**
- Visiting `/dance-extras/live` showed the main hub “Extra Use Case” panel.

**Cause**
- Router in `main.tsx` only matched pathname `=== '/dance-extras'`.

**Fix**
- Match `pathname === '/dance-extras' || pathname.startsWith('/dance-extras/')` so subpaths render `ExtraDanceApp`.

### 9) NHS transaction history: only “Audit” rows, no `/tx/0x…` link

**Symptom**
- `/nhs/transactions` shows **Audit** rows for paid GP access; **Explorer** has no per-row tx link; **`receiptRef`** missing from API JSON.

**Cause**
- Server code assumed **`chargeResponse.receipt.reference`** after the gateway charge. That property does not exist — the receipt is only produced when **`withReceipt()`** runs on a `Response`, or when read from **`Payment-Receipt`** / credential **`payload.hash`**.

**Fix**
- Use **`resolvePaymentReceiptRef`** (see Success §9 and **`server/nhs/payment.js`**). Persist **`receipt_ref`** on **`gp_access_requests`** and return **`receiptRef`** in JSON. Ensure **`NHS_ENABLE_PAYMENT_GATE`** is not `false` if you expect on-chain receipts.

### 10) TIP-20 mint: “gas limit too high”, `Unauthorized`, or `Invalid transaction envelope type: "0x76"`

**Symptom**
- Mint fails after **`Actions.token.createSync`**, or the wallet shows **`Invalid transaction envelope type: "0x76"`** when granting issuer.

**Cause**
- **`mint`** requires **`ISSUER_ROLE`**. Factory **`admin` ≠ issuer** unless roles were granted.
- **`grantRolesSync`** batches via **`sendTransaction`** and can emit **type `0x76`** envelopes that **viem + injected wallets** do not accept (only `0x0`, `0x1`, `0x2`, `0x4`).

**Fix**
- Grant issuer with **`writeContractSync`** on **`grantRole`** (single call), then **`Actions.token.mintSync`**. See Success §10 and **`src/tempoTip20Launch.ts`**.

---

## Best practices (repeatable habits)

### Documentation

1. Treat `HEALTHTECH_USE_CASES.md` as the contract source of truth.
2. Keep `README.md` as the “product layer” summary:
   - superapp definition,
   - stack,
   - route table,
   - quick start.
3. When asked to explain “superapp capabilities”, always map:
   - hub vs dedicated route vs backend endpoints vs integrations.

### Payment flow correctness

1. For x402 endpoints:
   - on upstream `402`, return the challenge response so `x402` can solve.
2. For solved payment forwarding:
   - forward the correct auth headers from the incoming request.
3. Keep a consistent “two-stage” mental model:
   - paid endpoint interaction (x402 solve),
   - polling or follow-up calls (often SIWX or bearer-token style depending on provider).

### Engineering hygiene

1. Never commit `.env` (it is gitignored).
2. Prefer `AGENTMAIL_INBOX_ID` + `AGENTMAIL_API_KEY` configuration over fragile passthrough scope behavior when possible.
3. Use `npm run dev:full` for the fastest end-to-end loop:
   - Vite on `5173`,
   - Express API on port `8787`.

### Fast debugging checklist

1. Confirm network selection (`testnet` vs `mainnet`) matches the endpoint expectation.
2. Confirm amount format (decimal-string, not base units) and fee/path configuration.
3. For integration errors:
   - if `402`: preserve challenge response,
   - if `401/403`: check the correct post-payment auth phase (SIWX vs bearer token vs API key).
4. If AgentMail inbox errors appear:
   - check `AGENTMAIL_INBOX_ID`,
   - prefer the API-key send strategy if `AGENTMAIL_API_KEY` is set.

---

## “Where to look” map

1. Superapp overview + route table: `README.md`
2. Use-case API mappings and flow steps: `HEALTHTECH_USE_CASES.md`
3. Implementation patterns and provider edge cases:
   - `server/index.js` (integration handlers, `402` passthrough, AgentMail send/inbox create)
4. Dev proxy: `vite.config.ts` (proxy `/api` -> `http://localhost:8787`)
5. Dance-extras live x402: `POST /api/dance-extras/live/:flowKey/:network`, verify with `GET /api/dance-extras/live`
6. Demo AgentMail inbox constant: `src/agentmailDemo.ts`
7. NHS payment gate + receipt reference: `server/nhs/payment.js`, `server/nhs/router.js`, `src/nhsApi.ts`; SQLite schema in `server/nhs/db.js` (`gp_access_requests.receipt_ref`)
8. TIP-20 launch + mint (issuer role, avoid `grantRolesSync` in browser): `src/tempoTip20Launch.ts`, `src/NhsTip20App.tsx`

