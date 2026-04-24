# Clinical Arc Landing Page Copy (Lovable)

Use this file as your website content source for Lovable.  
Tone: confident, product-first, demo-ready.

---

## SEO

**Page title:**  
Clinical Arc - HealthTech Intelligence with USDC Micropayments

**Meta description:**  
Clinical Arc combines NHS-style data intelligence, SNOMED CT, and dm+d workflows with Arc Testnet USDC x402 micropayments. Built for verifiable, pay-per-request healthcare APIs.

---

## Hero Section

**Headline:**  
HealthTech intelligence, paid per API call.

**Subheadline:**  
Clinical Arc turns healthcare data workflows into verifiable, usage-based APIs - powered by Arc Testnet, USDC, and x402 micropayments.

**Primary CTA:**  
Explore the Demo

**Secondary CTA:**  
View GitHub

**Trust strip (short):**  
OpenEHR + SNOMED CT + NHSBSA dm+d + NHS UK OpenGPT lane + CDR + on-chain runner + Arc + x402

---

## Problem Section

**Section title:**  
Healthcare APIs are high-value, but pricing and access are still outdated.

**Body copy:**  
Most health data products are sold as flat subscriptions, disconnected from actual usage and hard to verify in real time. Teams need a better model: pay only for what is used, keep every request auditable, and support both human and agent-driven workflows.

---

## Solution Section

**Section title:**  
Clinical Arc introduces usage-based HealthTech APIs.

**Body copy:**  
Clinical Arc is a reference application for modern healthcare data monetization. It combines clinical intelligence surfaces with x402 payment-gated endpoints, so each paid action can be priced, settled, and tracked transparently.

**Value bullets:**
- Pay-per-request USDC settlement for premium endpoints
- Wallet-native flows for MetaMask and Circle developer wallets
- Built-in transaction visibility for audit and demo evidence
- Designed for both user interfaces and agentic automation

---

## Feature Grid

### 1) Neighbourhood Health Insights
OpenEHR + synthetic HES intelligence with paid aggregate and summary actions.

### 2) SNOMED Intelligence
Local RF2 terminology browser: free GET search and concept detail, plus optional **paid POST** x402 on the **same** search and concept endpoints for demo parity (USDC per call).

### 3) dm+d Intelligence
NHSBSA dm+d drug intelligence experience with free lookup and paid summary endpoints.

### 4) NHS UK Dataset Lane
CSV-grounded retrieval and synthesis across OpenGPT-style NHS UK datasets with controllable prompt precision fields.

### 5) Flexible Settlement
Choose Circle Gateway x402 or thirdweb facilitator paths based on your wallet mode and payment strategy.

### 6) Wallet UX Built In
Support for MetaMask and Circle wallet flows, including Gateway top-up support and balance visibility.

### 7) CDR (Confidential Data Rails) Lane
Story-inspired confidential vault lifecycle with paid allocate, encrypt/store, request-access, and cooperative recovery flows.

### 8) Verifiable Activity
Page-level transaction logs make it easy to show payment events, references, and explorer links.

### 9) Wallet-Aware License Onboarding
One-click license check and starter-license issuance for the active MetaMask or Circle wallet in token policy mode.

### 10) Pinata + IPFS File Storage
Upload files into CDR vault flows with returned `cid`, `ipfs://` URI, gateway URL, and optional NFT-style metadata token URI.

### 11) On-Chain Runner + Nanopayment Evidence
Dual-mode runner for hackathon proof: **MetaMask-only** direct lane (one explorer hash per attempt) plus Circle x402 nanopayment runs (MetaMask or Circle) with honest batched-settlement messaging. Export, import, and paginated attempt history; status labels **Tx on-chain** vs **Paid (x402)** so paid calls without a per-request hash are not mislabeled as on-chain.

---

## How It Works (3 Steps)

**Step 1 - Connect Wallet**  
Choose MetaMask or Circle wallet mode and fund USDC on Arc Testnet.

**Step 2 - Run Intelligence Calls**  
Use free endpoints for discovery and paid endpoints for premium lookup or summarization (including NHS UK CSV-grounded synthesis), with one-click token-license onboarding in CDR token mode.

**Step 3 - Settle and Verify**  
x402 handles payment requirements, and transaction history provides proof of paid usage. Use the on-chain runner when you need an explicit multi-tx evidence pack (MetaMask direct lane) or a side-by-side Circle x402 nanopayment story—with clear labels when chain hashes are absent per request.

---

## Built For

- HealthTech founders building usage-based API businesses
- NHS innovation teams prototyping monetizable data services
- Developer teams shipping agent-ready, wallet-native products
- Hackathon teams demonstrating real payment + intelligence workflows

---

## Why Now

Healthcare is moving toward programmable workflows, and AI agents increasingly call APIs directly. Clinical Arc demonstrates a practical model for secure, granular, and machine-readable monetization in this new environment.

---

## Social Proof / Credibility

**Section title:**  
Open reference implementation, not slideware.

**Body copy:**  
Clinical Arc is implemented as a working React + Node/Express stack with live routes, reproducible payment flows, and integration-ready endpoints. Teams can fork, adapt, and launch quickly.

**Optional metrics row (replace with real numbers):**
- 5+ intelligence surfaces
- 2 wallet modes
- $0.01 paid action baseline in demo flows
- End-to-end x402 payment gating
- Exportable on-chain runner evidence (JSON)

---

## Live Reliability Proof

**Section title:**  
Built and tested in real runtime conditions.

**Body copy:**  
Clinical Arc is validated with live service checks, not only static screenshots. We actively monitor optional Snowstorm, local RF2 index health, dm+d, and x402 paths in the demo environment and treat infrastructure and content-state issues as first-class operational concerns.

**Proof bullets:**
- SNOMED **RF2 health** (`/api/snomed/rf2/health`) exposes index readiness and build status before search/concept calls
- dm+d intelligence surfaces the live upstream from `/api/dmd/health` instead of hardcoded local paths
- dm+d integration includes fallback query variants to reduce strict-match failures
- API responses expose attempted and matched queries for transparent troubleshooting
- Operational runbooks separate “service up” from “correct terminology edition loaded”
- dm+d Thirdweb settlement now explicitly covers paid `/api/dmd/lookup` and `/api/dmd/summary` routes

---

## Runtime Learnings

**Section title:**  
What we learned by running this stack end-to-end.

**Body copy:**  
In practice, terminology and payment systems fail in nuanced ways. We documented and productized those lessons so teams can diagnose faster and ship with more confidence.

**Learning bullets:**
- `http://snomed.info/sct` is the correct SNOMED FHIR system URI; most 404s were content-load mismatches, not URI mistakes
- Local RF2 gives a Snowstorm-free browse path; optional Snowstorm UK imports still take significant time and need enough Elasticsearch/Snowstorm memory when you use FHIR `$lookup`
- dm+d upstream search can be strict on casing and exact terms; backend fallback logic improves user-facing reliability
- Distinguishing wallet balance from Gateway balance avoids false payment debugging trails
- Keeping synthesis and retrieval on the same NHS UK dataset lane avoids data-source mismatch confusion
- Moving paid results directly under paid action panels reduces operator scrolling and support friction
- Circle wallet authorization failures are usually holder-specific license mismatches, not payment failures
- Returning both gateway and `ipfs://` links improves downstream smart-contract metadata interoperability

---

## CTA Band

**Headline:**  
Ship your own HealthTech pay-per-API product.

**Body copy:**  
Use Clinical Arc as your starting point and customize the workflows, pricing model, and integrations for your market.

**Primary CTA:**  
Start with Clinical Arc

**Secondary CTA:**  
Book a Demo

---

## FAQ

**Q: Is this production-ready for real patient data?**  
A: The demo is designed for synthetic/non-clinical datasets and prototyping. Production deployment requires your own governance, security, and compliance controls.

**Q: Why x402 instead of subscriptions?**  
A: x402 enables direct, per-request payment semantics at the API layer, which is better aligned with variable compute and agent-driven usage.

**Q: Can we use this with our own backend?**  
A: Yes. Clinical Arc is a reference architecture you can fork and adapt to your own APIs, identity model, and environment.

**Q: Which wallets are supported in the demo UX?**  
A: The app supports MetaMask and Circle wallet flows, including Circle Gateway top-up mechanics for paid actions.

---

## Suggested Lovable Section Order

1. Hero  
2. Problem  
3. Solution  
4. Feature Grid  
5. How It Works  
6. Built For  
7. Credibility  
8. FAQ  
9. Final CTA

---

## Link Targets (replace as needed)

- Demo: `https://your-demo-url.com/nhs`
- GitHub: `https://github.com/arunnadarasa/healtharcdemo`
- Docs: `https://github.com/arunnadarasa/healtharcdemo/blob/main/README.md`
- Contact: `mailto:you@yourdomain.com`

