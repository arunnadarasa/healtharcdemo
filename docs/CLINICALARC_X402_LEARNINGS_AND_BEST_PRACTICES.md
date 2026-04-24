# Clinical Arc · x402 learnings, successes, failures & best practices

This document consolidates **implementation experience** on **Arc Testnet (chain id `5042002`)** for the NHS / neighbourhood demo app: **HTTP 402 + USDC nanopayments**, **OpenEHR (EHRbase)**, **synthetic HES**, and **Featherless** summaries. It is meant for maintainers and hackathon submissions.

**Disclaimer:** prototype / hackathon only — use **synthetic or dummy** health data.

For shorter Circle-focused notes, see **`docs/ARC_X402_NOTES.md`**. For an earlier session log, see **`CLINICALARC_X402_AGENT_SESSION.md`**.

---

## 1. Architecture at a glance

| Layer | Role |
|-------|------|
| **Browser** | Wallet on Arc; paid POSTs go through **`nhsX402Fetch`** (`src/nhsArcPaidFetch.ts`) → **`@x402/fetch`** `wrapFetchWithPayment` + either Circle **batch** scheme or **Exact EVM (EIP-3009)** for Thirdweb. |
| **Settlement path A — Circle Gateway** | Default when **`X402_FACILITATOR` is not `thirdweb`**. Server: **`createGatewayMiddleware`** (`@circle-fin/x402-batching/server`). Client: batch + optional **Gateway deposit** (`ensureGatewayDepositForX402`, `src/arcGatewayDeposit.ts`). Conceptually this is Circle’s **nanopayment / Gateway** product — it **settles** x402-style payments; it is **not** Thirdweb’s `facilitator()` API. |
| **Settlement path B — Thirdweb** | When **`X402_FACILITATOR=thirdweb`** + **`THIRDWEB_SECRET_KEY`**. Server: **`facilitator`** + **`settlePayment`** (`thirdweb/x402`, `server/thirdwebX402.js`). Client: **`createExactArcX402PaymentFetch`** only (no Circle Gateway auto-deposit). **Browser must** set **`VITE_X402_FACILITATOR=thirdweb`** to match. |
| **“Roll your own” facilitator** | Not implemented here. You could verify/settle EIP-3009 yourself; **Circle** and **Thirdweb** are the two supported integrations in this repo. |

**Pricing:** Paid neighbourhood + OpenEHR routes use **`$0.01`** per request in server config (`server/neighbourhood/router.js`, `server/openehr/bffRouter.js`).

---

## 2. Successes (what worked)

1. **One paid client path**  
   Routing all gated NHS POSTs through **`apiPost`** → **`nhsX402Fetch`** avoids split “free vs paid” fetch modes in the UI and matches a production story: **one protocol**, one wallet flow.

2. **Circle Gateway + deposit before settle**  
   Aligning with Circle’s **deposit-then-settle** model fixed confusion where users had **wallet USDC** but **`insufficient_balance`** on settlement — **Gateway-available USDC** (after **approve + deposit** to the Gateway contract) is what matters for batched x402. See **`src/arcGatewayDeposit.ts`**, **`docs/ARC_X402_NOTES.md`**.

3. **Tx history that distinguishes hash vs audit**  
   **`nhsApi.ts`** extracts **64-byte tx hashes** (with or without `0x` prefix) for explorer links; when no hash exists, **audit** rows and **Wallet on explorer** remain honest fallbacks (`src/nhsTxHistory.ts`, neighbourhood transaction log).

4. **Neighbourhood insights: OpenEHR BFF + HES + Featherless**  
   - **AQL** proxied server-side so EHRbase credentials never hit the browser.  
   - **LSOA aggregates** from SQLite over artificial HES.  
   - **Featherless** for paid LLM summary; default model **Qwen** avoids Hugging Face–gated Llama **`model_gated_needs_oauth`** when Llama isn’t linked in Featherless.

5. **Circle Modular proxy**  
   Same-origin **`POST /api/circle-modular`** avoids browser CORS to `modular-sdk.circle.com`; **`VITE_CIRCLE_MODULAR_MOCK=1`** supports demos when upstream returns **403** (Cloudflare) from server-side calls.

6. **Thirdweb client fix (field name mismatch)**  
   Thirdweb’s **`settlePayment`** can emit **x402 v2** with **`maxAmountRequired`** in `accepts[]` while **`@x402` exact EIP-3009** expects **`amount`**. Without **`amount`**, the client threw **`Cannot convert undefined to a BigInt`**. Normalizing **`maxAmountRequired` → `amount`** in **`onBeforePaymentCreation`** (`src/arcX402Fetch.ts`) fixes signing for the Thirdweb path.

7. **Thirdweb server fix (`accepted` vs top-level `scheme` / `network`)**  
   **`@x402/fetch`** builds **x402 v2** **`PaymentPayload`** with **`scheme`** and **`network` on `accepted`** (see **`@x402/core`** types). Thirdweb’s **`decodePaymentRequest`** (`thirdweb` **`x402/common.js`**) matches **`decodedPayment.scheme`** and **`decodedPayment.network` at the top level only**. If those are missing, settlement never runs: the API returns **402** with **`Unable to find matching payment requirements`** (often with an **empty JSON body**; the message may appear only in the **`PAYMENT-REQUIRED`** header). This can look like “wallet didn’t sign” even when the **second** request includes **`PAYMENT-SIGNATURE`**.  
   **Fix (this repo):** **`normalizePaymentDataForThirdwebSettle`** in **`server/thirdwebX402.js`** — **`decodePayment`** → copy **`accepted.scheme` / `accepted.network`** to top level → **`encodePayment`** — then pass that string into **`settlePayment`**.

8. **402 error copy by facilitator**  
   Generic text that mentioned **Circle Gateway deposit** was misleading when **`VITE_X402_FACILITATOR=thirdweb`**. **`src/nhsApi.ts`** now branches 402 messages for Thirdweb vs Circle.

9. **Operational defaults**  
   - API **`npm run server`** → port **8787**; **`GET /openapi.json`** for discovery.  
   - Full stack: **`npm run dev:full`** (Vite **5173** + API). Vite proxies **`/api` → 8787**; brief **`ECONNREFUSED`** right after start is normal — refresh once the API is listening.

---

## 3. Failures, pitfalls & things that misled us

> [!WARNING]
> **Known external incident (Arc Testnet + Circle batching):** during the hackathon window, there is an active issue affecting settlement/validation timing when using `@circle-fin/x402-batching` on Arc Testnet. Symptom in this app: first paid request returns `402`, signature step succeeds, retry enters API, then client shows `signal timed out` before route completion. This is currently treated as an upstream network/facilitator incident, not a deterministic app-only bug.
>
> **Workaround for demos:** prefer **MetaMask mode + Thirdweb facilitator** for paid flows until the Arc/Circle incident is resolved. Keep Circle mode for wallet creation/funding demos, but avoid relying on Circle batching settlement for judged live runs while the incident is active.

1. **`insufficient_balance` (Gateway)**  
   Not the same as “zero wallet USDC.” Fund the **Gateway** via deposit when using Circle; watch **Gateway USDC** in the shell balance bar.

2. **Thirdweb 402 after signature (not always “wallet / balance”)**  
   If the **second** POST includes a payment header but still returns **402**, distinguish:  
   - **Decode mismatch:** **`Unable to find matching payment requirements`** — often **`@x402` v2** payload shape vs Thirdweb’s matcher; fixed by **`normalizePaymentDataForThirdwebSettle`** (see success **#7**).  
   - **True settlement failure:** facilitator / on-chain (**insufficient Arc USDC**, wrong **`payTo`**, etc.) — check **`settlePayment`** JSON **`error` / `errorMessage`**, Thirdweb dashboard, Arcscan.  
   - **Wallet never prompted:** different class of bug (client / extension).  
   Use DevTools **Network** (two requests? payment header on retry?) and server logs.

3. **Transaction log “Audit” vs “On-chain” (Thirdweb path)**  
   **Thirdweb** payments **do settle on-chain** via the facilitator. **`receiptRef: null`** and **Audit** rows in **`nhsTxHistory`** are **not** proof that nothing hit the chain — they mean this app **did not store a `0x…` tx hash** for that row. With **`skipInternalGateway`**, **`withArcGatewayGate`** does not set **`paymentReceiptRef`** from Circle’s **`req.payment`** (`server/nhs/payment.js`). **`txFromResponse`** (`src/nhsApi.ts`) only gets **On-chain** rows when it can extract a hash from **`receiptRef`**, **`payment-receipt` / `payment`** headers, etc. To show **Arcscan `/tx/…`** per row, wire Thirdweb’s **`PAYMENT-RESPONSE` / `X-PAYMENT-RESPONSE`** (or settlement metadata) into **`receiptRef`** or the headers the client already parses.

4. **Env mismatch (silent breakage)**  
   **`X402_FACILITATOR=thirdweb`** on the server without **`VITE_X402_FACILITATOR=thirdweb`** (or the reverse) produces confusing failures — always **pair** them and **restart both** Vite and Node.

5. **“50+ on-chain transactions” vs Gateway batching**  
   **Circle Gateway** batches micropayments; **50 paid HTTP calls ≠ 50 distinct explorer txs** necessarily. For hackathon evidence, show **Arcscan** history and be precise in wording. **Thirdweb** settlement may differ; verify on **testnet.arcscan.app**.

6. **EHRbase “unreachable”**  
   Requires Docker + **`EHRBASE_*`** in `.env` and API on **8787** — see **`docker-compose.ehrbase.yml`** and **`README.md`**.

7. **Featherless gated models**  
   Meta Llama via Featherless may require **HF OAuth**; **Qwen** default avoids that for demos.

8. **Circle Modular from Node**  
   Direct **`fetch` to modular-sdk** can see **Cloudflare 403**; browser direct hits **CORS**. Proxy + mock envs document operational limits.

9. **Role selector on neighbourhood flows**  
   **patient / gp / nhc_provider** does **not** change paid OpenEHR / HES / summary routes (x402 + wallet gate access). It still matters for **`/api/nhs/*`** routes that enforce **`getActor` / roles**.

10. **Identity bootstrap removed from hub**  
   Optional **`/api/nhs/identity/bootstrap`** was only for NHS SQLite identity; **not** required for neighbourhood + EHRbase demos. Server route may remain for other apps.

11. **Vite vs API startup race**  
    If the UI loads before **8787** is up, `/api/*` can error until refresh.

12. **dm+d name search is strict on upstream (`wardle/dmd`)**  
    `GET /dmd/v1/search?s=...` can return **`Not Found`** for lowercase or non-exact forms even when a canonical term exists (e.g. `amlodipine` vs `Amlodipine`). In this repo, `/api/dmd/search` now performs fallback query variants (lower/upper/title-case) and returns `attemptedQueries` + `matchedQuery` to make UX and debugging clearer.

13. **dm+d upstream is a separate process from Arc (`8787` / Vite `5173`)**  
    Set **`DMD_SERVICE_URL`** (e.g. `http://localhost:8082`) to a running wardle/dmd HTTP server. **`ECONNREFUSED`** on that URL means the wardle process (or stub) is not listening—not that `npm run dev:full` failed. Prefer a gitignored **`data/dmd-service/`** layout (`dmd-server.jar` + `dmd.db`) and **`npm run dmd:serve`**; use **`npm run dmd:stub`** only for demo names without TRUD. Health/search responses include a shared **`hint`** when the upstream is unreachable.

14. **Snowstorm UK import pitfalls (content mismatch root cause)**  
    SNOMED lookup `404 not-found` with diagnostics `Code '<id>' not found for system 'http://snomed.info/sct'` is often a **loaded-content issue**, not a wrong system URI. We observed failed UK RF2 imports on constrained Docker memory and branch-lock/partial-commit states. Practical recovery: raise Elasticsearch/Snowstorm heap, clear stuck partial commits, and re-import UK release before evaluating lookup behavior.

---

## 4. Best practices (checklist)

### x402 / payments

- [ ] **Pick one settlement path** per environment: Circle **or** Thirdweb; don’t mix client/server env.  
- [ ] **Circle:** Ensure **Gateway balance** + understand **wallet USDC ≠ Gateway available** until deposited.  
- [ ] **If Arc/Circle batching incident is active:** treat Circle settlement timeouts as potentially upstream; switch demo traffic to **Thirdweb** path for reliability.
- [ ] **Thirdweb:** **`THIRDWEB_SECRET_KEY`**, funded **Arc USDC** wallet for EIP-3009. Neighbourhood UI can switch **Circle vs Thirdweb** (header **`X-X402-Facilitator`**); default still comes from **`VITE_X402_FACILITATOR`** / **`X402_FACILITATOR`**.  
- [ ] **Thirdweb + `@x402/fetch`:** keep **`normalizePaymentDataForThirdwebSettle`** (`server/thirdwebX402.js`) — Thirdweb’s decoder expects top-level **`scheme` / `network`**; **`@x402` v2** puts them on **`accepted`**.  
- [ ] **Resource URL:** Vite proxy should forward host/proto (**`X-Forwarded-Host`**, **`X-Forwarded-Proto`**) so **`resourceUrl`** in **`settlePayment`** matches the browser origin (see **`resourceUrlFromReq`** in **`server/thirdwebX402.js`**).  
- [ ] **`NHS_ENABLE_PAYMENT_GATE=false`** only for local debugging without wallet — don’t ship that for paid demos.  
- [ ] After **any** `VITE_*` change, **restart Vite**.

### Engineering

- [ ] Prefer **`localhost:5173`** over **`127.0.0.1`** if you see odd IPv4/IPv6 listen issues on macOS.  
- [ ] **Never commit** real **`.env`** (keys, Thirdweb secret, Featherless, Circle keys).  
- [ ] **Instrumentation:** avoid shipping debug NDJSON / ingest URLs; keep production comments free of hypothesis IDs.

### Hackathon / submission (Nano Payments Arc–style rubrics)

- [ ] **≤ $0.01 per action:** point to **`$0.01`** in server gates and screen recording.  
- [ ] **50+ on-chain txs:** show **Arcscan** evidence; explain **batching** if using Circle.  
- [ ] **Margin / gas narrative:** micropayments break if each call paid **full L1-style gas** — **Arc + x402 + Gateway/Thirdweb** align unit economics.  
- [ ] **Tracks:** strongest fit — **Per-API monetization** + **Usage-based compute billing**; **Agent-to-agent** only if you demo a real **A2A** loop.

### Reference docs (external)

- [Circle Gateway nanopayments](https://developers.circle.com/gateway/nanopayments)  
- [Thirdweb x402 facilitator](https://portal.thirdweb.com/x402/facilitator) · index: [portal.thirdweb.com/llms.txt](https://portal.thirdweb.com/llms.txt)  
- [x402.org](https://www.x402.org/)  
- [Arc Testnet](https://docs.arc.network/) · explorer: [testnet.arcscan.app](https://testnet.arcscan.app)

### Ecosystem note: AIsa `nanopayment-x402`

[AIsa-team/nanopayment-x402](https://github.com/AIsa-team/nanopayment-x402) is a **client skill** for paying **AIsa’s hosted APIs** with **x402 + Circle Gateway** on Arc — useful as **patterns** and **optional integrations**, not as a replacement for Thirdweb’s facilitator in *this* app.

---

## 5. Key files (quick map)

| Area | Files |
|------|--------|
| Paid fetch / facilitator switch | `src/nhsArcPaidFetch.ts`, `src/arcX402Fetch.ts` |
| Thirdweb server gate | `server/thirdwebX402.js` (`settlePayment`, **`normalizePaymentDataForThirdwebSettle`**, **`resourceUrlFromReq`**) |
| Circle Gateway gate | `server/nhs/payment.js`, `server/index.js` (gateway middleware) |
| Neighbourhood + pricing | `server/neighbourhood/router.js` |
| OpenEHR BFF | `server/openehr/bffRouter.js` |
| API errors / tx extraction | `src/nhsApi.ts` |
| Tx log (localStorage) | `src/nhsTxHistory.ts`, `src/NhsNeighbourhoodInsightsApp.tsx` |
| Env template | `.env.example` |

---

## 6. Related in-repo docs

| Doc | Contents |
|-----|----------|
| `docs/ARC_X402_NOTES.md` | Arc chain, Gateway deposit, env knobs |
| `CLINICALARC_X402_AGENT_SESSION.md` | Earlier session notes (Circle-heavy) |
| `HEALTHTECH_USE_CASES.md` | Use-case contract (if present) |

---

*Last updated: Added dm+d upstream operations (wardle vs dev stack, `data/dmd-service`, stub) alongside prior dm+d search strictness + Snowstorm UK import notes; includes Arc Testnet + Circle batching incident warning and `@x402` payload-shape / tx-log learnings — Clinical Arc, Arc Testnet, x402.*
