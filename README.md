# Agentic Hackathon Arc · HealthTech Protocol

> **Workspace:** This repo is the **`agentic-hackathon-arc`** package — develop, commit, and run **`npm run dev`** / **`npm run server`** here. Treat **`Clinical Arc`** (sibling folder under Documents) as **read-only reference** unless you intentionally sync changes back.

**Frontend in this build:** **`/nhs/neighbourhood-insights`** is the **Neighbourhood health plan** (OpenEHR + HES + SNOMED + x402). **`/nhs/hes-scale`** is **HES at scale** — full artificial **AE / OP / APC** in SQLite, **FTS5** search, **x402**-paid queries, **Featherless** cross-dataset summary on aggregates. **`/nhs/uk-dataset-lane`** is the **NHS UK + OpenGPT data lane** — CSV-grounded paid retrieval and paid synthesis with precision controls (`content focus`, `audience`, `context rows`). **`/nhs/snomed-intelligence`** showcases Snowstorm-backed terminology lookups plus paid x402 terminology flows. **`/nhs/dmd-intelligence`** showcases NHSBSA dm+d lookup + paid enrichment/summary patterns. **`/nhs/cdr`** is the **CDR (Confidential Data Rails) lane** — policy-aware vault allocation, encrypt/store, access request, and cooperative recovery using Arc + USDC x402. **`/nhs/onchain-runner`** is a dedicated dual-mode proof runner with strict direct on-chain evidence and Circle x402 nanopayment batching evidence. **`/`**, **`/nhs`**, and unmatched paths render the **hackathon hub**.

**HealthTech Protocol** is the open **pattern stack** for verifiable payments and care-adjacent flows—**settled on [Arc](https://docs.arc.network/arc/references/connect-to-arc)** with **USDC nanopayments** via [Circle Gateway](https://developers.circle.com/gateway/nanopayments) and **x402** ([overview](https://developers.circle.com/gateway/nanopayments/concepts/x402)). The Express server still carries a broad route surface (NHS, neighbourhood, gateways, etc.); **Treat [`HEALTHTECH_USE_CASES.md`](./HEALTHTECH_USE_CASES.md) as the API / behavior contract** where you wire clients or tests.

**Canonical upstream:** **[arunnadarasa/clinicalarc](https://github.com/arunnadarasa/clinicalarc)**. **This hackathon checkout / demo remote:** **[arunnadarasa/healtharcdemo](https://github.com/arunnadarasa/healtharcdemo)**. **Live landing page:** **[clinipayarc.lovable.app](https://clinipayarc.lovable.app)**. **Live slide deck:** **[clinipayarcslides.lovable.app](https://clinipayarcslides.lovable.app)**. **Notes:** [`OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md`](./OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md). **Data safety:** use **dummy or synthetic** patient data in demos only — never real patient-identifiable data.

---

## Hackathon criteria alignment

Judging-style expectations for **Arc Testnet + USDC nanopayments + x402** are spelled out in [`docs/CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md`](./docs/CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md) (*Hackathon / submission*). This README maps the **healtharcdemo** tree to those criteria; use **`/nhs/neighbourhood-insights`** as the primary demo surface.

| Criterion | How this repo addresses it |
|-----------|------------------------------|
| **≤ $0.01 per paid API action** | x402 gates on neighbourhood + OpenEHR BFF routes use **$0.01** (see `server/neighbourhood/router.js`, `server/openehr/bffRouter.js`). The in-app transaction log shows **Cost (list)** **`$0.01`** for covered endpoints (`NEIGHBOURHOOD_X402_PRICE_DISPLAY` in `src/nhsTxHistory.ts`). |
| **Volume / on-chain evidence (e.g. 50+ txs)** | Use **`/nhs/onchain-runner`** in dual-mode: **Direct on-chain** (MetaMask only) for strict tx-per-attempt proof, and **Circle x402 nanopayments** for paid-call logging plus batched-settlement evidence. The attempts table labels successes as **Tx on-chain** when a hash exists, or **Paid (x402)** when the paid call succeeded without a per-request hash. Recommended run is **5 batches × 10 calls** and exported attempts/summary JSON plus Arcscan checks. |
| **Margin & gas narrative** | The neighbourhood UI includes a **margin & gas** section explaining why sub-dollar API pricing is viable on **Arc + x402** versus naive per-transaction gas. |
| **Track fit (per-API monetization, usage-based compute)** | **Per-request x402** on priced routes (LSOA / insights, OpenEHR BFF, summary, etc.) — HTTP **402** + payment behind the BFF, not a flat subscription. |
| **Synthetic data & safety** | **Artificial HES** ingestion and demo EHRbase paths only — follow [`OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md`](./OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md) (disclaimer + checklist). |

**Demo / video evidence**

- Record paid actions on **`/nhs/neighbourhood-insights`** (wallet signing + successful API response).
- Show **Circle Developer Console** when using **Circle Gateway**, and the same wallet on **[testnet.arcscan.app](https://testnet.arcscan.app)**.
- Optional reviewer links: [Circle MCP](https://developers.circle.com/ai/mcp), [AIsa nanopayment-x402](https://github.com/AIsa-team/nanopayment-x402) for client x402 patterns.

**Broader team checklist** (roles, smoke flows, audit logging): [`OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md`](./OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md#practical-checklist-for-hackathon-teams).

---

## What this repo layers

| Layer | Role |
|--------|------|
| **Hackathon hub (`/` · `/nhs` · other unmatched `/nhs/*`)** | **Wallet + funnel** to the intelligence demos (`NhsHubApp` + shared `NhsShell`). |
| **Neighbourhood health plan (`/nhs/neighbourhood-insights`)** | **Hackathon app:** **openEHR** (EHRbase AQL via BFF), synthetic **artificial HES** LSOA aggregates, **SNOMED CT** ([IHTSDO](https://github.com/IHTSDO)), **Arc** + **USDC** (**x402**), optional **Featherless** narrative, **Circle Modular**, **Thirdweb** facilitator option where configured. |
| **HES at scale (`/nhs/hes-scale`)** | **Full** artificial HES **AE + OP + APC** (streaming CSV ingest into SQLite), **FTS5** + prefix search (**`/api/neighbourhood/scale/search`**), **Featherless** AE+OP+APC narrative (**`/api/neighbourhood/scale/cross-summary`**), x402 **$0.01** per paid call — scalability story for judges. |
| **NHS UK dataset lane (`/nhs/uk-dataset-lane`)** | OpenGPT-style NHS UK CSV lane with **paid retrieval** (**`/api/neighbourhood/uk/search`**) and **paid synthesis** (**`/api/neighbourhood/uk/synthesis`**) grounded on selected dataset rows; includes precision controls for focused output. |
| **SNOMED intelligence (`/nhs/snomed-intelligence`)** | Hybrid SNOMED demo: local RF2 browser/search (`/api/snomed/rf2/*`) for full-package terminology retrieval plus optional Snowstorm health/lookup and paid terminology search/summary x402 routes. |
| **dm+d intelligence (`/nhs/dmd-intelligence`)** | NHSBSA dm+d demo with free search/health checks and paid `lookup` + `summary` endpoints via x402. |
| **CDR lane (`/nhs/cdr`)** | Story-inspired confidential data rails demo: **paid** vault allocation, **paid** encrypt/store, **paid** access + recovery lifecycle, plus audit log views. |
| **Backend (`server/`)** | Express: **`/api/nhs/*`**, **`/api/neighbourhood/*`** (includes **`/scale/*`** + **`/uk/*`**), **`/api/openehr/*`**, **`/api/snomed/*`**, **`/api/cdr/*`**, **`POST /api/circle-modular`**, plus many optional gateway routes — see **`GET /openapi.json`**. |

**Artificial HES (full data):** CSVs are published by **[NHS Digital — Artificial data](https://digital.nhs.uk/services/artificial-data)** (synthetic administrative / hospital episode–style datasets for non-production use). Download the release you need, then point ingest env vars at the extracted folders. **`npm run ingest:hes`** uses **`HES_AE_DIR`**, **`HES_OP_DIR`**, **`HES_APC_DIR`** (or legacy **`HES_SAMPLE_DIR`** for AE-only). Optional **`HES_ROW_LIMIT_PER_FILE`**, **`HES_CLEAR_FIRST=1`**, **`HES_INGEST_BATCH`**. Large CSVs use **streaming** (no full-file RAM). If you loaded data before FTS existed, run **`npm run hes:rebuild-fts`**. Follow the **NHS Digital** licence terms for that service; this app treats ingested rows as **demo / non-clinical** only.

**EHRbase (live AQL):** the BFF calls EHRbase at `EHRBASE_BASE_URL` (default `http://localhost:8080/ehrbase`). **Start the stack:** `npm run ehrbase:up` (same as `docker compose -f docker-compose.ehrbase.yml up -d`). Wait until the API responds — first boot can take a few minutes. **Credentials** must match the container: by default `EHRBASE_USER=ehrbase-user` and `EHRBASE_PASSWORD=SuperSecretPassword` (see `docker-compose.ehrbase.yml`). **Run the API** on port 8787 (`npm run server` or `npm run dev:full`) so `/api/neighbourhood/insights/health` can reach EHRbase. If Docker fails to parse `.env`, ensure every line is either `KEY=value` or starts with `#` (no stray text like `HES ingest:` without `#`). **Port 5432** is exposed for Postgres — if another Postgres uses 5432, stop it or change the host port in `docker-compose.ehrbase.yml`.

---

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 8  
- **Payments:** **Circle Gateway** x402 (`@circle-fin/x402-batching`), **x402** stack (`@x402/core`, `@x402/fetch`, `@x402/evm`), optional **Thirdweb** settlement paths where enabled, **viem** + **Arc Testnet** (`arcTestnet`, chain id **5042002**) — see [`docs/ARC_X402_NOTES.md`](./docs/ARC_X402_NOTES.md)  
- **Backend:** Node.js, Express 5  
- **Docs:** [`HEALTHTECH_USE_CASES.md`](./HEALTHTECH_USE_CASES.md), [`docs/ARC_X402_NOTES.md`](./docs/ARC_X402_NOTES.md), [`docs/OPENAPI_DISCOVERY.md`](./docs/OPENAPI_DISCOVERY.md)  
- **Landing / website handoff:** [`LOVABLE_LANDING_PAGE_CONTENT.md`](./LOVABLE_LANDING_PAGE_CONTENT.md), [`HEALTH_TECH_PROTOCOL_AZ.md`](./HEALTH_TECH_PROTOCOL_AZ.md), live: [clinipayarc.lovable.app](https://clinipayarc.lovable.app)  
- **Presentation deck copy:** [`SLIDE_DECK_CONTENT_TECH_AND_VC.md`](./SLIDE_DECK_CONTENT_TECH_AND_VC.md), live: [clinipayarcslides.lovable.app](https://clinipayarcslides.lovable.app)  
- **Agent / tribal knowledge:** [`CLAWHUB.md`](./CLAWHUB.md)  
- **LLM context bundle:** [`public/llm-full.txt`](./public/llm-full.txt) — **regenerate:** `npm run build:llm`  

### Local dev (Vite + API)

| Command | What runs |
|--------|------------|
| `npm run dev` | Vite only — **proxies `/api` → `http://localhost:8787`** |
| `npm run server` | Express API (default **port 8787**) |
| `npm run dev:full` | Both (recommended for live x402 flows) |
| `npm run ingest:hes` | Stream-ingest artificial HES **AE / OP / APC** CSVs → `data/neighbourhood-hes.db` (see **`HES_*_DIR`** env vars) |
| `npm run hes:rebuild-fts` | Rebuild **FTS5** index from base HES tables (after legacy ingest) |
| `npm run burst:hackathon` | 50× unpaid POST smoke (use with `NHS_ENABLE_PAYMENT_GATE=false`) |
| `npm run snowstorm:up` | Optional [Snowstorm](https://github.com/IHTSDO/snowstorm) + Elasticsearch (`docker-compose.snowstorm.yml`, Snowstorm on **localhost:8081**) |
| `npm run snowstorm:down` | Stop Snowstorm + Elasticsearch (keeps the named Docker volume / data) |
| `npm run snowstorm:poll-import -- <uuid>` | Poll `GET /imports/<uuid>` until the RF2 import finishes (see **`docs/SNOWSTORM_FULL_RF2_IMPORT.md`**) |

Set **`SNOWSTORM_URL=http://localhost:8081`** and load a SNOMED CT RF2 release into Snowstorm for FHIR `$lookup` to return concepts ([loading SNOMED](https://github.com/IHTSDO/snowstorm/blob/master/docs/loading-snomed.md)). **Step-by-step for a full edition before submission:** [`docs/SNOWSTORM_FULL_RF2_IMPORT.md`](./docs/SNOWSTORM_FULL_RF2_IMPORT.md).

For the Snowstorm-free path in this repo, configure:
- **`SNOMED_RF2_BASE_DIR`** (root folder containing your extracted RF2 packages; default is the local hackathon path under `~/Downloads`)
- **`SNOMED_RF2_SQLITE_PATH`** (optional override for the local RF2 index DB; default `data/snomed-rf2.db`)

Then use `/api/snomed/rf2/health`, `/api/snomed/rf2/search`, and `/api/snomed/rf2/concept/:sctid` from the SNOMED page. Public **SNOMED International Browser** still works without Snowstorm.

If the UI shows **`Cannot POST /api/...`**, restart the backend on **8787**. Quick check: **`GET http://localhost:8787/openapi.json`**.

### Runtime reliability notes (SNOMED + dm+d)

- **SNOMED URI:** Keep FHIR lookup `system` as **`http://snomed.info/sct`**. If a concept returns not-found, check local Snowstorm content/version state before changing URI logic.
- **Snowstorm imports:** UK RF2 loads may run for extended periods and are memory-sensitive; allocate sufficient heap to Elasticsearch/Snowstorm and monitor import job state to completion.
- **Local RF2 index path:** If you need deterministic local browse/search without Docker/Elasticsearch, use the RF2 endpoints (`/api/snomed/rf2/*`). First index build is file-size dependent (can take minutes on full UK+INT packages), then subsequent queries are local SQLite lookups.
- **dm+d strict matching:** Some upstream `wardle/dmd` queries are case/exact-match sensitive. This repo now tries multiple query variants and returns attempted/matched query metadata in dm+d responses.
- **Payment troubleshooting:** Distinguish wallet USDC from Gateway available balance, especially in Circle mode where Gateway deposits are required for paid x402 flows.

For hackathon capture steps, see **[Hackathon criteria alignment](#hackathon-criteria-alignment)**. For codegen velocity: [Circle MCP](https://developers.circle.com/ai/mcp) + [`llms-full.txt`](https://developers.circle.com/llms-full.txt).

---

## Arc Testnet (quick reference)

- **Chain ID:** `5042002` (`eip155:5042002`)  
- **Settlement:** Circle Gateway x402 + USDC-style nanopayments  
- **Faucet:** [faucet.circle.com](https://faucet.circle.com) (linked from the app)  
- **Explorer:** [testnet.arcscan.app](https://testnet.arcscan.app)  

---

## Routes (this build)

| Path | Purpose |
|------|---------|
| `/nhs/neighbourhood-insights` | **Neighbourhood health plan** — HES aggregates, OpenEHR BFF, SNOMED tools, x402-paid actions, **transaction log** (paginated), facilitator preference. |
| `/nhs/hes-scale` | **HES at scale** — SQLite row counts + on-disk DB size, **paid** FTS/prefix search, **paid** Featherless AE+OP+APC summary, tx log. |
| `/nhs/uk-dataset-lane` | **NHS UK + OpenGPT data lane** — **paid** CSV retrieval + **paid** CSV-grounded synthesis with `content focus`, `audience`, and `context rows`. |
| `/nhs/snomed-intelligence` | **SNOMED intelligence** — local RF2 browser (word + SCTID search, concept detail tabs) + optional Snowstorm health/lookup + paid terminology search/summary with x402. |
| `/nhs/dmd-intelligence` | **dm+d intelligence** — NHSBSA dm+d free search/health and paid lookup/summary x402 flows. |
| `/nhs/cdr` | **CDR (Confidential Data Rails)** — policy templates, paid vault lifecycle (`allocate`, `encrypt-store`, `request-access`, `recover`, `revoke`), and audit/tx timeline. |
| `/nhs/onchain-runner` | **On-chain runner** — dual-mode runner: **direct** lane (MetaMask, strict tx hash per attempt) and **Circle x402** lane (MetaMask or Circle; batched settlement caveat) + export/import JSON evidence + clear attempt status labels. |
| **`/`** · **`/nhs`** · **other unmatched paths** | **Hackathon hub** — wallet, links to neighbourhood + HES scale + NHS UK lane + SNOMED + dm+d + CDR + on-chain runner (`src/main.tsx` + `src/hubRoutes.ts`). |

**Server APIs used by the demo (non-exhaustive):** **`/api/nhs/*`**, **`/api/neighbourhood/*`** (incl. **`/scale/search`**, **`/scale/cross-summary`**, **`/uk/search`**, **`/uk/synthesis`**), **`/api/openehr/*`**, **`/api/snomed/*`** (including **`/rf2/health`**, **`/rf2/search`**, **`/rf2/concept/:sctid`**), **`/api/cdr/*`** (`/vaults/allocate`, `/vaults/:vaultId/encrypt-store`, `/vaults/:vaultId/request-access`, `/vaults/:vaultId/recover`, `/vaults/:vaultId/revoke`, `/vaults/:vaultId`, `/audit`, `/licenses/check`, `/licenses/issue`), **`POST /api/circle-modular`**, **`POST /api/arc/faucet`** — full list: **`GET /openapi.json`** (proxied in dev; also **`http://localhost:8787/openapi.json`**).

### CDR token/license contract (Arc testnet)

CDR `policyMode=token` is backed by an on-chain `LicenseCondition` contract on Arc testnet.

1. Configure env:
   - `ARC_RPC_URL` (Arc testnet RPC)
   - `DEPLOYER_PRIVATE_KEY` (deployer wallet)
2. Compile and deploy:
   - `npm run compile:contracts`
   - `npm run deploy:license:arc`
3. Seed a test license (optional):
   - `LICENSE_CONDITION_ADDRESS=0x... LICENSE_HOLDER_ADDRESS=0x... npm run seed:license:arc`
4. In `/nhs/cdr`, choose **Token / licence gate** and provide:
   - contract address
   - license id
   - optional required scope
   - or use **`Issue starter license (current wallet)`** to auto-issue for Circle/MetaMask mode and auto-fill `license id`.

For token mode, access/recovery now returns explicit authorization outcomes:
`license_missing`, `license_expired`, `license_revoked`, `requester_not_holder`, `scope_mismatch`.

### CDR file uploads (Pinata/IPFS)

`/nhs/cdr` now supports file uploads in `encrypt-store`:

1. Set **Payload mode** to **Upload file (Pinata IPFS)**.
2. Provide `PINATA_JWT` in server `.env`.
3. Optional: enable **NFT-style metadata** generation for token URI-compatible JSON on IPFS.

Returned asset storage now includes:
- `cid`
- `ipfsUri`
- `gatewayUrl`
- optional metadata (`cid`, `ipfsUri`, `tokenUri`)

### On-chain runner (dual-mode)

Use `/nhs/onchain-runner` for hackathon evidence in two lanes:

1. **Direct on-chain transfer mode**: strict tx-per-attempt proof; each successful attempt must return `0x...` hash. **Requires MetaMask wallet mode** (uses injected `window.ethereum`); not available when the hub is in **Circle wallet** mode.
2. **Circle x402 nanopayments mode**: logs paid request success per attempt while allowing settlement to batch. Runs with **MetaMask or Circle** when x402 / Gateway prerequisites are met.
3. Recommended volume run: **batch size 10** and **batch count 5** (50 total sequential attempts).
4. Export both artifacts: `runner-attempts-*.json` and `runner-summary-*.json`.
5. For nanopayments mode, explain that successful paid calls can exceed visible on-chain tx count due to batching in Circle Gateway.
6. **Persistence and recovery:** attempts are saved in the browser; **Clear output** clears the screen only; **Delete stored history** wipes saved attempts; **Import attempts JSON** restores from a prior `runner-attempts-*.json` export.
7. **Table UX:** filter by mode (all / direct / Circle x402), **51 rows per page**, and date/time column for each attempt. **Status column:** **Tx on-chain** when a transaction hash is present; **Paid (x402)** when the nanopayment call succeeded without a per-request hash (batched settlement); **Failed** otherwise—so judges are not misled when `txHash` is empty in x402 mode.
8. **Import / export round-trip:** each exported attempt row includes **`ok`** plus the fields above. Imports **normalize** older files that omitted `ok` or only implied success via `paymentStatus`, infer **x402 vs direct** from `mode` or from `endpoint` (`/api/...` → x402 lane). After import, the **transactions view filter resets to “All transaction modes”** so a leftover “Direct only” filter does not hide x402 rows.

### SNOMED local RF2 browser (full package)

- SNOMED page now includes a **local RF2 browser pane** with search-by-term, direct SCTID lookup, and tabbed concept details (summary, descriptions, hierarchy).
- Backend local RF2 endpoints:
  - `GET /api/snomed/rf2/health`
  - `GET /api/snomed/rf2/search?q=...&limit=...`
  - `GET /api/snomed/rf2/concept/:sctid`
- Data source expectation: extracted RF2 package root at `SNOMED_RF2_BASE_DIR` (default hackathon local path).
- Search behavior: active description FTS index for word/SCTID discovery; concept details include FSN/PT heuristics plus active IS-A parent/child snippets for quick navigation.

### dm+d local dataset (UI + server)

- The **dm+d intelligence** page shows the active upstream from **`GET /api/dmd/health`** (when `DMD_SERVICE_URL` is set, the UI displays that base URL; otherwise it shows the server hint).
- Point `DMD_SERVICE_URL` at a running [wardle/dmd](https://github.com/wardle/dmd)-compatible service (for example `http://localhost:8082`). Large TRUD extracts are typically kept under repo **`data/`** (gitignored); keep paths in `.env` or local docs, not committed blobs.

## Quick start

```bash
git clone https://github.com/arunnadarasa/healtharcdemo.git
cd healtharcdemo
npm install
cp .env.example .env
# Edit .env: API keys, X402_SELLER_ADDRESS / seller, EHRbase URL, third-party URLs as needed.

npm run server    # Terminal 1 — API (default 8787)
npm run dev       # Terminal 2 — Vite (proxies /api and /openapi.json)
```

Or: `npm run dev:full`

Open **http://localhost:5173/** (hub) or go straight to **http://localhost:5173/nhs/neighbourhood-insights**.

Upstream **Clinical Arc** clone (if you track that repo instead): `git clone https://github.com/arunnadarasa/clinicalarc.git` — use the same `npm install` / `.env` / dual-process flow.

**Production build:** `npm run build` (runs **`build:llm`** first) then `npm run preview` (API still needs `npm run server` or your host).

---

## For newcomers (wallet, Gateway, and on-chain activity)

If you are new to **x402**, **Circle Gateway**, or **Arc Testnet**, read this before debugging “why did my wallet send a transaction?” or “why is my payment failing?”

1. **Run two processes.** The UI is **Vite** (default **http://localhost:5173**); the API is **Express** on **8787**. Vite **proxies `/api`** to the API. Prefer **`npm run dev:full`**, or run **`npm run server`** and **`npm run dev`** in two terminals. If you see **`Cannot POST /api/...`** or Vite **proxy** errors, start the API **first**, then hard-refresh the browser. A quick API check: **`GET http://localhost:8787/openapi.json`**.

2. **Use Arc Testnet in the wallet.** This app targets **Arc Testnet** (chain id **5042002**). Fund the wallet with **test USDC** from **[faucet.circle.com](https://faucet.circle.com)** (see also the Arc Testnet table above).

3. **Gateway balance ≠ wallet balance.** Paying through Circle Gateway requires **USDC available inside the Gateway** for the app’s domain—not only USDC sitting in your EOA. Moving funds into the Gateway is done with on-chain contracts. On **[Arcscan](https://testnet.arcscan.app)** you will often see:
   - **`approve`** on the USDC (`NativeFiatToken`) contract — authorizes the Gateway to pull USDC from your wallet. This is typically **one setup step** (until you change or revoke allowance).
   - **`deposit`** — moves USDC from your wallet **into** the Gateway. You may **repeat** deposits when Gateway available balance is low; this repo can **auto-ensure** a minimum deposit before x402 (see **`.env.example`** and **[`docs/ARC_X402_NOTES.md`](./docs/ARC_X402_NOTES.md)**).

   Those transactions **fund and authorize the Gateway**. They are **not** the same as “one on-chain transaction every time you click Save” in the NHS UI—many x402 flows **batch or settle** without a separate user transaction per HTTP request.

4. **Transaction log: Audit vs on-chain.** In this repo, the **transaction log** for paid neighbourhood actions lives on **`/nhs/neighbourhood-insights`** (not a separate `/nhs/transactions` page). **On-chain** rows include a **tx hash** you can open on the explorer; **Audit** rows logged the request without a stored hash—**that does not prove** the x402 payment failed. Use **Wallet on explorer** on testnet when you need to inspect your address manually.

5. **More reading.** Practical pitfalls and session notes: **[`CLINICALARC_X402_AGENT_SESSION.md`](./CLINICALARC_X402_AGENT_SESSION.md)**. NHS routes and behavior: **[`HEALTHTECH_USE_CASES.md`](./HEALTHTECH_USE_CASES.md)**. Tribal debugging: **[`CLAWHUB.md`](./CLAWHUB.md)**.

---

## Environment variables

Copy **`.env.example`** → **`.env`**. Never commit **`.env`**.

Typical groups: **Arc / x402** and NHS runtime flags — see `.env.example`.

---

## Agents & LLM context

| Resource | Purpose |
|----------|---------|
| [`public/llm-full.txt`](./public/llm-full.txt) | Single-file bundle — **regenerate:** `npm run build:llm` |
| [`CLAWHUB.md`](./CLAWHUB.md) | Debugging notes |
| [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) | Copilot hints |

---

## Repository layout

```
├── src/              # React apps; routes in main.tsx + hubRoutes.ts
├── server/           # Express API (index.js, payments.js)
├── public/           # Static assets; llm-full.txt generated here
├── scripts/          # build-llm-full.mjs, …
├── docs/             # ARC_X402_NOTES, OPENAPI_DISCOVERY, …
├── .cursor/skills/clawhub/  # Cursor skill
├── HEALTHTECH_USE_CASES.md
├── CLAWHUB.md
└── vite.config.ts    # dev proxy: /api → http://localhost:8787
```

---

## Security & operations

- Keep **secrets in `.env`** only.  
- **Live mainnet** flows spend real assets — test on **testnet** first.  
- Transaction hashes can be recorded locally; use **[testnet.arcscan.app](https://testnet.arcscan.app)** for Arc Testnet.

---

## Contributing

1. Fork **[healtharcdemo](https://github.com/arunnadarasa/healtharcdemo)** (this tree) or **[clinicalarc](https://github.com/arunnadarasa/clinicalarc)** (upstream), depending on where you send PRs  
2. Configure `.env` for the use cases you need  
3. Extend `server/index.js` or add `src/*App.tsx` + route in `src/main.tsx` and **`src/hubRoutes.ts`**  
4. After doc edits that feed **`llm-full.txt`**, run **`npm run build:llm`** before committing (or **`npm run build`**, which invokes it)  

---

## License

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE).

---

**Agentic Hackathon Arc** · **HealthTech Protocol** — *Arc Testnet + Circle Gateway x402 for health use cases.*
