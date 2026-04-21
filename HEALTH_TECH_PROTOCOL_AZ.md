# HealthTech Protocol — A to Z

**Use this document** to build a landing page (e.g. in Lovable), social copy, or investor one-pagers. It explains the protocol end-to-end and points to the open-source reference app on GitHub.

| | |
|---|---|
| **Protocol** | HealthTech Protocol — pattern stack for **neighbourhood health** and care-ops money flows on **Tempo** + **x402/x402** |
| **Reference app** | **Clinical Arc** — [`github.com/arunnadarasa/clinicaltempo`](https://github.com/arunnadarasa/clinicaltempo) |
| **Settlement** | [Tempo](https://tempo.xyz) (L1 tuned for payments) |
| **HTTP payments** | [x402 protocol](https://developers.circle.com/gateway/nanopayments/concepts/x402) (Circle Gateway on Arc) |

---

## Elevator pitch

**HealthTech Protocol** is an open **pattern stack** for **health and care delivery**: wallet-verified requests, payment-gated service writes, care coordination, monitoring, and agent-friendly APIs—plus **legacy** demo flows (battle entry, coaching, beats, dance-extras) that prove the same **charge / session / 402** patterns. Paid third-party APIs (email, travel, music, intel) plug in the same way.

Money and API access are **settled on Tempo** and **authorized through x402 and HTTP 402 (x402)** so flows stay **verifiable**, **composable**, and **agent-ready**: humans, scripts, and services can participate under explicit trust boundaries.

**Clinical Arc** is the **reference implementation**: one hub, dedicated demos, and a production-style Node/Express API you can fork.

---

## A — Architecture (four layers)

1. **Experience** — Clinical Arc NHS apps (`/nhs/*`) and legacy full-screen demos (battle, coaching, beats, dance-extras, kicks, travel, …).  
2. **API** — Express routes that encode intents, receipts, and integration behavior.  
3. **Payments** — `x402 client` on client and server; Tempo chain actions via `viem`.  
4. **Integrations** — Paid third parties (AgentMail, Suno, OpenWeather, KicksDB, …) via x402 catalog hosts or env-configured proxies.

---

## B — Blockchain: why Tempo?

Tempo is used as the **settlement layer**: fast finality, stable-asset patterns, and tooling that fits **machine-readable payments** (x402) alongside human wallet UX. The protocol is **not** “one smart contract”—it’s **how you wire** industry flows to Tempo’s settlement and receipts.

---

## C — Charges & sessions

Two recurring **payment intents** in the stack:

- **`charge`** — One-shot payment (entry, license, attestation, pass).  
- **`session`** — Metered or repeated ticks (coaching minutes, micropot-style accumulation).

Both map to x402 semantics and show up across hub copy and `HEALTHTECH_USE_CASES.md`.

---

## D — Clinical Arc (reference implementation)

**Clinical Arc** encodes HealthTech Protocol in a real codebase:

- **Frontend:** React, TypeScript, Vite.  
- **Backend:** Express 5, payment verification, `402` passthrough, proxies.  
- **Repo:** [`github.com/arunnadarasa/clinicaltempo`](https://github.com/arunnadarasa/clinicaltempo) — clone, configure `.env`, run `npm run dev:full`.

---

## E — Ecosystem (third-party gateways)

Third-party HTTP APIs often use **x402** challenges; Clinical Arc wires vendors through **`server/index.js`** and documents env vars in **`.env.example`**.

---

## F — Forks & extensibility

The protocol is **meant to be forked**: add a route, add a `src/*App.tsx`, mirror the same **pay → receipt → side effect** pattern. Behavioral contracts live in **`HEALTHTECH_USE_CASES.md`**.

---

## G — Glossary (money on the internet)

- **x402 / 402** — HTTP *Payment Required*; challenge that `x402 client` can solve so a client pays and retries.  
- **Receipt** — Proof linked to a payment or intent (audit trail for judges, ops, fans).  
- **TIP-20** — Token patterns on Tempo (e.g. factory demos in-repo).

---

## H — Humans & agents (one protocol)

HealthTech Protocol is **one** stack. “Human→human,” “human→agent,” “agent→human,” and “agent→agent” are **shorthand** for who **authorizes spend** and who **benefits**—not four separate specs.

| Shorthand | Meaning |
|-----------|--------|
| Human ↔ human | Wallet commerce (fees, passes, splits). |
| Human → agent | User approves; orchestrator calls the same HTTP APIs. |
| Agent → human | Automation delivers email, alerts, passes to people. |
| Agent ↔ agent | Service-to-service: machine payments, API keys after x402, webhooks. |

---

## I — Integrations (examples)

Illustrative rails demonstrated or scaffolded: **AgentMail**, **StablePhone**, **StableSocial**, **StableTravel**, **Laso** cards, **Suno**, **Parallel**, **OpenWeather**, **OpenAI x402**, **KicksDB**, **Google Maps**, **Aviationstack**, **Alchemy**, **Fal**, **Replicate**, **TIP-20** factory—not all required; enable via env.

---

## J — Justice & judging (paid writes)

Judge score submission is modeled as a **paid write API**: accountability and receipts for who scored whom, when—aligned with battle and event timelines.

---

## K — Keys & configuration

Operators use **`.env`**: `X402_SELLER_ADDRESS`, optional vendor keys, AgentMail (`AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`), OpenAI, KicksDB, etc. **Never commit secrets**; copy from **`.env.example`**.

---

## L — Live vs simulate

Many flows support **simulate** (mock API, no chain spend) and **live** (Tempo x402 with wallet). Example: **`/dance-extras`** → `POST /api/dance-extras/live/:flowKey/:network` after an x402 charge.

---

## M — x402 (Machine Payments Protocol)

x402 standardizes **how** machines and wallets pay for HTTP resources: challenges, retries, receipts. Clinical Arc uses **`x402 client`** client/server and forwards **402** responses so clients can complete payment.

---

## N — Networks

| Network | Chain ID | Notes |
|---------|-----------|--------|
| Arc testnet (Moderato) | `42431` | Default for safe iteration; pathUSD-style fee patterns. |
| mainnet | `4217` | Real value; test thoroughly on testnet first. |

---

## O — Open source

License: **MIT** (see `LICENSE` in the repo). Use commercially; attribute; contribute back if you can.

---

## P — Product surfaces (routes)

Examples users can open in Clinical Arc:

| Path | Idea |
|------|------|
| `/nhs`, `/` | **Clinical Arc** — NHS neighbourhood care hub + workflows |
| `/battle` | Battle entry + payout (legacy demo) |
| `/coaching` | Coaching minutes (legacy demo) |
| `/beats` | Beat licensing (legacy demo) |
| `/dance-extras` | Seven core **event-style** scaffolds + live x402 |
| `/kicks`, `/travel`, `/music`, `/email`, … | Vertical demos |

Full table: **`README.md`** in the repo.

---

## Q — Quality & ops

**CLAWHUB.md** in the repo captures **what worked and what failed** (AgentMail inbox scope, stale API processes, 402 loops)—useful for operators and coding agents.

---

## R — Receipts & auditability

Receipts tie **payment** to **business events** (scores, usage ticks, passes, clip sales). That’s the trust layer for organizers, dancers, and partners.

---

## S — Security

- Secrets only in **`.env`**.  
- **Testnet first** for new flows.  
- **Mainnet** spends real assets—match recipient config and network selection to your deployment.

---

## T — Tempo (settlement)

Tempo provides the **chain context** for settlement; pair with **explorers** (e.g. testnet/mainnet explorers linked from the app) for transaction hashes.

---

## U — Use cases (ten+)

**NHS:** GP access, care plans, social prescribing, neighbourhood teams, monitoring, alerts (`/api/nhs/*`). **Legacy demos:** battle entry, judge scores, cypher micropot, coaching minutes, beat licensing, clip rights router, reputation attestations, studio AI billing, ops bot + email, fan battle pass—plus integrations above. Details: **`HEALTHTECH_USE_CASES.md`**.

---

## V — Verifiability

The protocol bias is **prove what happened**: payment proof, API receipt, optional on-chain hash exposure—so disputes and automation have a shared source of truth.

---

## W — Wallets

Users pay with **injected wallets** (e.g. MetaMask, Tempo-capable wallets). Server-side keys handle **delegated** or **post-payment** calls where appropriate (e.g. AgentMail after x402 charge).

---

## X — x402 (HTTP Payment Required)

Third-party APIs may return **402** + **WWW-Authenticate**. The backend **preserves** the challenge for `x402 client`; swallowing 402 as a generic error breaks the payment loop.

---

## Y — You (who this is for)

- **Event orgs & platforms** — standardized payment patterns for competitions and community products.  
- **Builders** — fork Clinical Arc, swap branding, connect your keys.  
- **Agents & automation** — same HTTP contracts; explicit trust for who signs and who pays.

---

## Z — Zero lock-in (philosophy)

The protocol is **patterns + reference code**, not a single vendor gate. Swap integrations via env; replace UIs; keep Tempo + x402 as the spine—or extract the API contract only.

---

## Suggested Lovable CTA block

**Headline:** *HealthTech Protocol — verifiable payments for neighbourhood health.*

**Sub:** *Built on Tempo & x402. Ship faster with the open Clinical Arc reference app.*

**Primary button:** [View on GitHub](https://github.com/arunnadarasa/clinicaltempo)

**Secondary:** [Try the docs — README](https://github.com/arunnadarasa/clinicaltempo/blob/main/README.md)

---

## Files to read next (in repo)

| File | Purpose |
|------|---------|
| `README.md` | Overview, routes, quick start |
| `HEALTHTECH_USE_CASES.md` | Flow-by-flow API mapping |
| `CLAWHUB.md` | Operational learnings |
| `.env.example` | Configuration surface |

---

*This file is maintained for landing-page and handoff use. Protocol naming: **HealthTech Protocol**; implementation / app: **Clinical Arc** · [`github.com/arunnadarasa/clinicaltempo`](https://github.com/arunnadarasa/clinicaltempo).*
