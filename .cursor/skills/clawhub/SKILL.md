---
name: clawhub
description: >-
  Clinical Arc / HealthTech Protocol — full repo context via public/llm-full.txt (or /llm-full.txt),
  tribal debugging via CLAWHUB.md, Arc Testnet + Circle Gateway x402, NHS routes, TIP-20 (viem/tempo),
  dance-extras live routes. Use when: (1) Onboarding an agent or pasting system context, (2) Debugging 402,
  stale API, or port 8787 issues, (3) Editing docs that feed llm-full.txt, (4) Working on hub routes,
  server/index.js, or integrations (AgentMail, OpenAI gateway, etc.), (5) Preparing a ClawHub or Copilot
  instruction bundle, (6) OpenAPI discovery at GET /openapi.json, (7) OpenClaw — optional
  **@anyway-sh/anyway-openclaw** plugin. For raw EVVM protocol depth, fetch https://www.evvm.info/llms-full.txt
  (not vendored in-repo).
metadata: {}
---

# Clinical Arc · ClawHub context skill

**Clinical Arc** is the reference **HealthTech Protocol** app: React hub + dedicated routes, Node/Express API, **Arc Testnet** settlement via **Circle Gateway x402**. This skill tells agents **where context lives** and **how to avoid known traps** (see `CLAWHUB.md`).

---

## Quick reference

| Situation | Action |
| --- | --- |
| Need **one file** with README + use cases + protocol + ClawHub | Load **`public/llm-full.txt`** or **`/llm-full.txt`** (running app). |
| **`402` / wallet** confusion | **`CLAWHUB.md`** + relevant route in **`server/index.js`**. |
| **UI works but API 404 / HTML** | Backend not running or **stale** process — restart **`npm run server`** (**`8787`**). |
| Verify live dance handler exists | **`GET http://localhost:8787/api/dance-extras/live`** → JSON with `flowKeys`. |
| **Which screens exist** | **`src/hubRoutes.ts`**; hub **`/`**. |
| **Changed markdown** included in bundle | **`npm run build:llm`** (runs before **`npm run build`**). |
| **OpenAPI** | **`GET /openapi.json`**; **`npm run discovery`** · **`docs/OPENAPI_DISCOVERY.md`** |
| **OpenClaw + extra capabilities** | Optional plugin: **`openclaw plugins install @anyway-sh/anyway-openclaw`** |
| **Promotion** of a fix for future agents | Short entry under **Successes** or **Failures** in **`CLAWHUB.md`** (no secrets). |
| **TIP-20 mint** (`/nhs/tip20`) — issuer role + envelope `0x76` | **`CLAWHUB.md`**; code **`src/tempoTip20Launch.ts`**. Mint needs **`ISSUER_ROLE`**; use **`writeContractSync(grantRole)`**, not **`grantRolesSync`** (batched tx type **0x76** breaks viem + browser wallets). |

---

## When to activate (triggers)

Use this skill automatically when:

1. The user @-mentions **`llm-full.txt`**, **`CLAWHUB`**, **Clinical Arc**, **x402**, **dance-extras**, or **Arc testnet**.
2. The task touches **`server/index.js`**, **`server/payments.js`**, or **`src/danceExtras*.ts`**.
3. Docs are edited that appear in **`scripts/build-llm-full.mjs`** (bundle sources).

---

## Recommended: Cursor / IDE

1. **`@`** `public/llm-full.txt` for broad changes; **`@`** `CLAWHUB.md` when debugging past incidents.
2. Project rules: repo root **`AGENTS.md`** or **`.cursor/rules`** if present — align with **`README.md`**.

---

## Repository map (where to look)

```
clinicalarc/
├── public/llm-full.txt          # Generated — run npm run build:llm
├── CLAWHUB.md                   # Tribal knowledge
├── README.md                    # Routes, stack, quick start
├── HEALTHTECH_USE_CASES.md       # Flow-by-flow API contract
├── server/index.js              # Express routes, integrations
├── server/openapi.mjs           # OpenAPI 3.1 for GET /openapi.json
├── server/payments.js           # Chain IDs, charge helpers
├── src/hubRoutes.ts             # Hub directory of routes
├── src/danceExtrasLiveX402.ts   # Browser x402 helpers (live flows)
├── src/danceExtrasJudgeWire.ts  # Judge-score wire snippets
├── docs/ARC_X402_NOTES.md
└── scripts/build-llm-full.mjs   # Source list for llm-full.txt
```

---

## Debugging (tribal knowledge)

Read **`CLAWHUB.md`** for successes / failures (**`402`** loops, **stale Express on 8787**, etc.)

---

## Key implementation pointers

| Topic | Location |
| --- | --- |
| Live dance flows | **`POST /api/dance-extras/live/:flowKey/:network`** — **`GET /api/dance-extras/live`** |
| Hub routes | **`src/hubRoutes.ts`** |
| Browser x402 | **`src/danceExtrasLiveX402.ts`**, **`src/arcX402Fetch.ts`**, **`src/nhsArcPaidFetch.ts`** |
| Server | **`server/index.js`** |

---

## Copilot Chat integration

Commit **`/.github/copilot-instructions.md`** when present; align with **`README.md`**.
