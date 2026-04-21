# HealthTech Protocol · Clinical Arc

> **Workspace:** This tree lives under **`Agentic Hackathon Arc`** — use this folder for ongoing hackathon development, commits, and running `npm run dev` / `npm run server`. Treat **`Clinical Arc`** (sibling folder under Documents) as **read-only reference** unless you intentionally sync changes back.

**Frontend (hackathon scope):** **`/`** and **`/nhs`** — home (wallet, faucet, optional bootstrap); **`/nhs/neighbourhood-insights`** — OpenEHR + artificial HES + SNOMED + x402 demo. Any other path (e.g. old `/nhs/gp-access`) shows the **same home** — those screens are not linked.

**HealthTech Protocol** is the open **pattern stack** for this NHS app: verifiable payments, session metering, care pathways, remote monitoring, and AI-assisted workflows—**settled on [Arc](https://docs.arc.network/arc/references/connect-to-arc)** with **USDC nanopayments** via [Circle Gateway](https://developers.circle.com/gateway/nanopayments) and the **x402** HTTP payment protocol ([overview](https://developers.circle.com/gateway/nanopayments/concepts/x402)).

This is a **reference implementation**: React (Vite) front ends, a Node/Express API, and production-style persistence for NHS flows. **Treat [`HEALTHTECH_USE_CASES.md`](./HEALTHTECH_USE_CASES.md) as the behavioral contract** for routes, endpoints, and testing notes.

**Primary remote:** **[arunnadarasa/clinicalarc](https://github.com/arunnadarasa/clinicalarc)**. **Hackathon demo mirror:** **[arunnadarasa/healtharcdemo](https://github.com/arunnadarasa/healtharcdemo)** (Agentic Hackathon Arc). **NHS / hackathon notes:** [`OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md`](./OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md). **Data safety:** use **dummy or synthetic** patient data in demos only — never real patient-identifiable data.

---

## What this repo layers

| Layer | Role |
|--------|------|
| **Clinical Arc (`/` · `/nhs/*`)** | **Core product:** NHS-aligned hub and flows—wallet identity, GP access, care plans, social prescribing, neighbourhood teams, monitoring, transactions. |
| **Neighbourhood health plan (`/nhs/neighbourhood-insights`)** | **Hackathon:** **openEHR** (EHRbase AQL via BFF), synthetic **artificial HES** LSOA aggregates, **SNOMED CT** browser references ([IHTSDO](https://github.com/IHTSDO)), **Arc** + **USDC** nanopayments (**x402**), optional **Featherless** narrative, **Circle Modular** panel. |
| **Backend (`server/`)** | Express API: **`/api/nhs/*`**, **`/api/neighbourhood/*`**, **`/api/openehr/*`**, **`/api/circle-modular`** (proxy). |

**Artificial HES:** run `npm run ingest:hes` (set `HES_SAMPLE_DIR` to your `artificial_hes_ae_*` folder). Data is **synthetic** — see NHS sample README.

**EHRbase (live AQL):** the BFF calls EHRbase at `EHRBASE_BASE_URL` (default `http://localhost:8080/ehrbase`). **Start the stack:** `npm run ehrbase:up` (same as `docker compose -f docker-compose.ehrbase.yml up -d`). Wait until the API responds — first boot can take a few minutes. **Credentials** must match the container: by default `EHRBASE_USER=ehrbase-user` and `EHRBASE_PASSWORD=SuperSecretPassword` (see `docker-compose.ehrbase.yml`). **Run the API** on port 8787 (`npm run server` or `npm run dev:full`) so `/api/neighbourhood/insights/health` can reach EHRbase. If Docker fails to parse `.env`, ensure every line is either `KEY=value` or starts with `#` (no stray text like `HES ingest:` without `#`). **Port 5432** is exposed for Postgres — if another Postgres uses 5432, stop it or change the host port in `docker-compose.ehrbase.yml`.

---

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 8  
- **Payments:** **Circle Gateway** x402 (`@circle-fin/x402-batching`), **x402** stack (`@x402/core`, `@x402/fetch`, `@x402/evm`), **viem** + **Arc Testnet** (`arcTestnet`, chain id **5042002**)  
- **Backend:** Node.js, Express 5  
- **Docs:** [`HEALTHTECH_USE_CASES.md`](./HEALTHTECH_USE_CASES.md), [`docs/ARC_X402_NOTES.md`](./docs/ARC_X402_NOTES.md), [`docs/OPENAPI_DISCOVERY.md`](./docs/OPENAPI_DISCOVERY.md)  
- **Landing / Lovable handoff:** [`HEALTH_TECH_PROTOCOL_AZ.md`](./HEALTH_TECH_PROTOCOL_AZ.md)  
- **Agent / tribal knowledge:** [`CLAWHUB.md`](./CLAWHUB.md)  
- **LLM context bundle:** [`public/llm-full.txt`](./public/llm-full.txt) — **regenerate:** `npm run build:llm`  

### Local dev (Vite + API)

| Command | What runs |
|--------|------------|
| `npm run dev` | Vite only — **proxies `/api` → `http://localhost:8787`** |
| `npm run server` | Express API (default **port 8787**) |
| `npm run dev:full` | Both (recommended for live x402 flows) |
| `npm run ingest:hes` | Load artificial HES AE CSVs into `data/neighbourhood-hes.db` (set `HES_SAMPLE_DIR`) |
| `npm run burst:hackathon` | 50× unpaid POST smoke (use with `NHS_ENABLE_PAYMENT_GATE=false`) |
| `npm run snowstorm:up` | Optional [Snowstorm](https://github.com/IHTSDO/snowstorm) + Elasticsearch (`docker-compose.snowstorm.yml`, Snowstorm on **localhost:8081**) |

Set **`SNOWSTORM_URL=http://localhost:8081`** and load a SNOMED CT RF2 release into Snowstorm for FHIR `$lookup` to return concepts ([loading SNOMED](https://github.com/IHTSDO/snowstorm/blob/master/docs/loading-snomed.md)). Public **SNOMED International Browser** still works without Snowstorm.

If the UI shows **`Cannot POST /api/...`**, restart the backend on **8787**. Quick check: **`GET http://localhost:8787/openapi.json`**.

**Hackathon submission video:** record a wallet payment in **Circle Developer Console** and the same tx on **testnet.arcscan.app**; use paid buttons on **`/nhs/neighbourhood-insights`** for Arc + x402 proof. Optional: [Circle MCP](https://developers.circle.com/ai/mcp) + [`llms-full.txt`](https://developers.circle.com/llms-full.txt) for codegen; [AIsa nanopayment-x402](https://github.com/AIsa-team/nanopayment-x402) as a client x402 reference.

---

## Arc Testnet (quick reference)

- **Chain ID:** `5042002` (`eip155:5042002`)  
- **Settlement:** Circle Gateway x402 + USDC-style nanopayments  
- **Faucet:** [faucet.circle.com](https://faucet.circle.com) (linked from the app)  
- **Explorer:** [testnet.arcscan.app](https://testnet.arcscan.app)  

---

## Routes (selected)

### NHS hub

| Path | Purpose |
|------|---------|
| `/` · `/nhs` | **NHS hub** |
| `/nhs/gp-access` | GP access requests |
| `/nhs/care-plans` | Care plans |
| `/nhs/social-prescribing` | Social prescribing |
| `/nhs/neighbourhood-teams` | Neighbourhood coordination |
| `/nhs/monitoring` | Remote monitoring |
| `/nhs/transactions` | Transaction history |
| `/nhs/neighbourhood-insights` | Artificial HES aggregates + OpenEHR AQL + optional LLM (x402) |

**API:** **`/api/nhs/*`**, **`/api/neighbourhood/*`**, **`/api/openehr/*`** — **`GET /openapi.json`** for discovery.

## Quick start

```bash
git clone https://github.com/arunnadarasa/clinicalarc.git
cd clinicalarc
npm install
cp .env.example .env
# Edit .env: API keys, X402_SELLER_ADDRESS / seller, third-party URLs as needed.

npm run server    # Terminal 1 — API (default 8787)
npm run dev       # Terminal 2 — Vite (proxies /api)
```

Or: `npm run dev:full`

Open **http://localhost:5173/** (NHS hub) or **http://localhost:5173/nhs/gp-access**.

**Production build:** `npm run build` then `npm run preview` (API still needs `npm run server` or your host).

---

## For newcomers (wallet, Gateway, and on-chain activity)

If you are new to **x402**, **Circle Gateway**, or **Arc Testnet**, read this before debugging “why did my wallet send a transaction?” or “why is my payment failing?”

1. **Run two processes.** The UI is **Vite** (default **http://localhost:5173**); the API is **Express** on **8787**. Vite **proxies `/api`** to the API. Prefer **`npm run dev:full`**, or run **`npm run server`** and **`npm run dev`** in two terminals. If you see **`Cannot POST /api/...`** or Vite **proxy** errors, start the API **first**, then hard-refresh the browser. A quick API check: **`GET http://localhost:8787/openapi.json`**.

2. **Use Arc Testnet in the wallet.** This app targets **Arc Testnet** (chain id **5042002**). Fund the wallet with **test USDC** from **[faucet.circle.com](https://faucet.circle.com)** (see also the Arc Testnet table above).

3. **Gateway balance ≠ wallet balance.** Paying through Circle Gateway requires **USDC available inside the Gateway** for the app’s domain—not only USDC sitting in your EOA. Moving funds into the Gateway is done with on-chain contracts. On **[Arcscan](https://testnet.arcscan.app)** you will often see:
   - **`approve`** on the USDC (`NativeFiatToken`) contract — authorizes the Gateway to pull USDC from your wallet. This is typically **one setup step** (until you change or revoke allowance).
   - **`deposit`** — moves USDC from your wallet **into** the Gateway. You may **repeat** deposits when Gateway available balance is low; this repo can **auto-ensure** a minimum deposit before x402 (see **`.env.example`** and **[`docs/ARC_X402_NOTES.md`](./docs/ARC_X402_NOTES.md)**).

   Those transactions **fund and authorize the Gateway**. They are **not** the same as “one on-chain transaction every time you click Save” in the NHS UI—many x402 flows **batch or settle** without a separate user transaction per HTTP request.

4. **Transactions page: Audit vs on-chain.** Under **/nhs/transactions**, **On-chain** means we parsed a **tx hash** and can link to the explorer. **Audit** means we logged the request (and often a **reference id**) without a usable hash in the response—**that does not prove** the x402 payment failed. Use **Wallet on explorer** on testnet when you need to inspect your address manually.

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

1. Fork **`https://github.com/arunnadarasa/clinicalarc`**  
2. Configure `.env` for the use cases you need  
3. Extend `server/index.js` or add `src/*App.tsx` + route in `src/main.tsx` and **`src/hubRoutes.ts`**  
4. After doc edits that feed **`llm-full.txt`**, run **`npm run build:llm`** before committing  

---

## License

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE).

---

**HealthTech Protocol** · **Clinical Arc** — *Arc Testnet + Circle Gateway x402 for health use cases.*
