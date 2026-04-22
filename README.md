# Agentic Hackathon Arc · HealthTech Protocol

> **Workspace:** This repo is the **`agentic-hackathon-arc`** package — develop, commit, and run **`npm run dev`** / **`npm run server`** here. Treat **`Clinical Arc`** (sibling folder under Documents) as **read-only reference** unless you intentionally sync changes back.

**Frontend in this build:** **`/nhs/neighbourhood-insights`** is the **Neighbourhood health plan** (OpenEHR + HES + SNOMED + x402). **`/nhs/hes-scale`** is **HES at scale** — full artificial **AE / OP / APC** in SQLite, **FTS5** search, **x402**-paid queries, **Featherless** cross-dataset summary on aggregates. **`/nhs/snomed-intelligence`** showcases Snowstorm-backed terminology lookups plus paid x402 terminology flows. **`/nhs/dmd-intelligence`** showcases NHSBSA dm+d lookup + paid enrichment/summary patterns. **`/`**, **`/nhs`**, and unmatched paths render the **hackathon hub**.

**HealthTech Protocol** is the open **pattern stack** for verifiable payments and care-adjacent flows—**settled on [Arc](https://docs.arc.network/arc/references/connect-to-arc)** with **USDC nanopayments** via [Circle Gateway](https://developers.circle.com/gateway/nanopayments) and **x402** ([overview](https://developers.circle.com/gateway/nanopayments/concepts/x402)). The Express server still carries a broad route surface (NHS, neighbourhood, gateways, etc.); **Treat [`HEALTHTECH_USE_CASES.md`](./HEALTHTECH_USE_CASES.md) as the API / behavior contract** where you wire clients or tests.

**Canonical upstream:** **[arunnadarasa/clinicalarc](https://github.com/arunnadarasa/clinicalarc)**. **This hackathon checkout / demo remote:** **[arunnadarasa/healtharcdemo](https://github.com/arunnadarasa/healtharcdemo)**. **Notes:** [`OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md`](./OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md). **Data safety:** use **dummy or synthetic** patient data in demos only — never real patient-identifiable data.

---

## Hackathon criteria alignment

Judging-style expectations for **Arc Testnet + USDC nanopayments + x402** are spelled out in [`docs/CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md`](./docs/CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md) (*Hackathon / submission*). This README maps the **healtharcdemo** tree to those criteria; use **`/nhs/neighbourhood-insights`** as the primary demo surface.

| Criterion | How this repo addresses it |
|-----------|------------------------------|
| **≤ $0.01 per paid API action** | x402 gates on neighbourhood + OpenEHR BFF routes use **$0.01** (see `server/neighbourhood/router.js`, `server/openehr/bffRouter.js`). The in-app transaction log shows **Cost (list)** **`$0.01`** for covered endpoints (`NEIGHBOURHOOD_X402_PRICE_DISPLAY` in `src/nhsTxHistory.ts`). |
| **Volume / on-chain evidence (e.g. 50+ txs)** | Drive many paid calls from the neighbourhood page; collect **[Arc Testnet](https://testnet.arcscan.app)** history for the demo wallet. **Circle Gateway** can **batch** — N paid HTTP requests are not always N distinct explorer transactions; state that clearly. **Thirdweb** facilitator paths may differ; verify on Arcscan. |
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
| **SNOMED intelligence (`/nhs/snomed-intelligence`)** | Snowstorm + SNOMED CT demo with free health/lookup checks and paid terminology search/summary routes using x402. |
| **dm+d intelligence (`/nhs/dmd-intelligence`)** | NHSBSA dm+d demo with free search/health checks and paid `lookup` + `summary` endpoints via x402. |
| **Backend (`server/`)** | Express: **`/api/nhs/*`**, **`/api/neighbourhood/*`** (includes **`/scale/*`**), **`/api/openehr/*`**, **`/api/snomed/*`**, **`POST /api/circle-modular`**, plus many optional gateway routes — see **`GET /openapi.json`**. |

**Artificial HES (full data):** CSVs are published by **[NHS Digital — Artificial data](https://digital.nhs.uk/services/artificial-data)** (synthetic administrative / hospital episode–style datasets for non-production use). Download the release you need, then point ingest env vars at the extracted folders. **`npm run ingest:hes`** uses **`HES_AE_DIR`**, **`HES_OP_DIR`**, **`HES_APC_DIR`** (or legacy **`HES_SAMPLE_DIR`** for AE-only). Optional **`HES_ROW_LIMIT_PER_FILE`**, **`HES_CLEAR_FIRST=1`**, **`HES_INGEST_BATCH`**. Large CSVs use **streaming** (no full-file RAM). If you loaded data before FTS existed, run **`npm run hes:rebuild-fts`**. Follow the **NHS Digital** licence terms for that service; this app treats ingested rows as **demo / non-clinical** only.

**EHRbase (live AQL):** the BFF calls EHRbase at `EHRBASE_BASE_URL` (default `http://localhost:8080/ehrbase`). **Start the stack:** `npm run ehrbase:up` (same as `docker compose -f docker-compose.ehrbase.yml up -d`). Wait until the API responds — first boot can take a few minutes. **Credentials** must match the container: by default `EHRBASE_USER=ehrbase-user` and `EHRBASE_PASSWORD=SuperSecretPassword` (see `docker-compose.ehrbase.yml`). **Run the API** on port 8787 (`npm run server` or `npm run dev:full`) so `/api/neighbourhood/insights/health` can reach EHRbase. If Docker fails to parse `.env`, ensure every line is either `KEY=value` or starts with `#` (no stray text like `HES ingest:` without `#`). **Port 5432** is exposed for Postgres — if another Postgres uses 5432, stop it or change the host port in `docker-compose.ehrbase.yml`.

---

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 8  
- **Payments:** **Circle Gateway** x402 (`@circle-fin/x402-batching`), **x402** stack (`@x402/core`, `@x402/fetch`, `@x402/evm`), optional **Thirdweb** settlement paths where enabled, **viem** + **Arc Testnet** (`arcTestnet`, chain id **5042002**) — see [`docs/ARC_X402_NOTES.md`](./docs/ARC_X402_NOTES.md)  
- **Backend:** Node.js, Express 5  
- **Docs:** [`HEALTHTECH_USE_CASES.md`](./HEALTHTECH_USE_CASES.md), [`docs/ARC_X402_NOTES.md`](./docs/ARC_X402_NOTES.md), [`docs/OPENAPI_DISCOVERY.md`](./docs/OPENAPI_DISCOVERY.md)  
- **Landing / website handoff:** [`LOVABLE_LANDING_PAGE_CONTENT.md`](./LOVABLE_LANDING_PAGE_CONTENT.md), [`HEALTH_TECH_PROTOCOL_AZ.md`](./HEALTH_TECH_PROTOCOL_AZ.md)  
- **Presentation deck copy:** [`SLIDE_DECK_CONTENT_TECH_AND_VC.md`](./SLIDE_DECK_CONTENT_TECH_AND_VC.md)  
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

Set **`SNOWSTORM_URL=http://localhost:8081`** and load a SNOMED CT RF2 release into Snowstorm for FHIR `$lookup` to return concepts ([loading SNOMED](https://github.com/IHTSDO/snowstorm/blob/master/docs/loading-snomed.md)). Public **SNOMED International Browser** still works without Snowstorm.

If the UI shows **`Cannot POST /api/...`**, restart the backend on **8787**. Quick check: **`GET http://localhost:8787/openapi.json`**.

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
| `/nhs/snomed-intelligence` | **SNOMED intelligence** — Snowstorm health/lookup plus paid terminology search and paid summary with x402. |
| `/nhs/dmd-intelligence` | **dm+d intelligence** — NHSBSA dm+d free search/health and paid lookup/summary x402 flows. |
| **`/`** · **`/nhs`** · **other unmatched paths** | **Hackathon hub** — wallet, links to neighbourhood + HES scale + SNOMED + dm+d (`src/main.tsx` + `src/hubRoutes.ts`). |

**Server APIs used by the demo (non-exhaustive):** **`/api/nhs/*`**, **`/api/neighbourhood/*`** (incl. **`/scale/search`**, **`/scale/cross-summary`**), **`/api/openehr/*`**, **`/api/snomed/*`**, **`POST /api/circle-modular`**, **`POST /api/arc/faucet`** — full list: **`GET /openapi.json`** (proxied in dev; also **`http://localhost:8787/openapi.json`**).

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
