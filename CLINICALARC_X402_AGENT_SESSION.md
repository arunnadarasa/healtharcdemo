# Clinical Arc · x402 & Circle Gateway — agent session learnings

This document captures **technical learnings from building and debugging** the Clinical Arc NHS hub on **Arc Testnet (chain id `5042002`)** with **Circle Gateway x402** (not Tempo / MPP). It complements **OPENCLAW_CLINICAL_HACKATHON_LEARNINGS.md** (workflow/product angle) with **implementation notes, successes, and failures** from this session.

**Disclaimer:** hackathon / prototype only; use **dummy or synthetic** patient data.

---

## 1. What we aimed for

- **NHS core app only** — hub and `/nhs/*` flows (care plans, social prescribing, neighbourhood teams, monitoring, transactions).
- **Enforced x402** for gated NHS writes; **no “direct fetch”** as a user-facing payment mode — the client always uses **`nhsX402Fetch`** (or equivalent) for paid POSTs.
- **Branding:** “Clinical Arc” and **Arc Testnet** alignment.
- **Server-side gate** (`NHS_ENABLE_PAYMENT_GATE`) optional via `.env`; when on, POSTs use **`withArcGatewayGate`** and attach **`paymentReceiptRef`** from **`req.payment`** (`transaction` / `payer`) for audit wiring.

---

## 2. Successes (what worked)

1. **Single payment path in the UI**  
   Removing payment-mode toggles and always routing paid POSTs through **`nhsApi`** → **`nhsX402Fetch`** reduced confusion and matched the “real” production story: one protocol, one client path.

2. **Gateway balance + deposit before settle**  
   Failures like **`Payment settlement failed (insufficient_balance)`** were often **not** “you have no USDC on Arc” but **“no available USDC inside the Circle Gateway wallet for this domain.”**  
   Aligning with Circle’s **deposit-before-settle** pattern (see **circlefin/arc-nanopayments** and related blog material) led to:
   - **`arcGatewayConstants.ts`** (e.g. domain **26** for Arc testnet),
   - **`arcGatewayBalance.ts`** (POST to Circle’s `gateway-api-testnet` balances API),
   - **`arcGatewayDeposit.ts`** (ERC-20 **approve** + **GatewayWallet `deposit`**, same contract ideas as **`@circle-fin/x402-batching`**),
   - **`ensureGatewayDepositForX402`** called before **`createArcX402PaymentFetch`** in **`nhsArcPaidFetch.ts`** and **`danceExtrasLiveX402.ts`**, with optional env knobs for min/top-up and skip flags (documented in **`.env.example`** and **`docs/ARC_X402_NOTES.md`**).

3. **Stricter tx-hash parsing in transaction history**  
   **`extractTxHash`** in **`src/nhsApi.ts`** originally required **`0x` + 64 hex**. Wallet addresses (**40** hex chars) were sometimes mistaken for hashes; tightening to **full 64-byte hashes** fixed bogus “on-chain” links.  
   **Follow-up success:** accepting **bare 64-character hex** (no `0x`) when facilitators omit the prefix so more rows can show **View transaction** instead of **Audit**.

4. **Operational clarity**  
   - **API:** `npm run server` → default **8787**; **`GET /openapi.json`** is a quick health/discovery check.  
   - **Full stack:** `npm run dev:full` or Vite + server in two terminals; Vite **proxies `/api` → `http://localhost:8787`**.  
   - **`Cannot POST /api/...` or proxy errors** usually mean the **API is not listening** — restart **`npm run server`** (or `dev:full`).

5. **Conceptual clarity: Audit vs On-chain in the Transactions UI**  
   - **On-chain** in the table means: we parsed a **tx hash** and can link to the explorer.  
   - **Audit** means: we logged the **request** (and often a **`receiptRef`** / id), but **no usable tx hash** was in the JSON/headers — **it does not necessarily mean** the x402 payment failed off-chain; settlement can still occur.  
   - **“Wallet on explorer”** is the fallback when there is **no per-row hash** — useful for manual verification on the testnet explorer.

---

## 3. failures & pitfalls (what hurt or misled us)

1. **`insufficient_balance` vs native vs ERC-20 USDC**  
   Users may hold **native** balance or **ERC-20 USDC** at the Arc USDC contract; **Gateway settlement** cares about **Gateway-available** balance after **deposit**. Confusing the two led to false “I have USDC” assumptions.

2. **MetaMask / EIP-712 vs “classic” Send**  
   Circle Gateway flows often use **EIP-712** signing; users may not see a familiar “Send transaction” for every step. Expecting only classic sends caused confusion during 402 handling.

3. **Vite proxy `ECONNREFUSED` on `/api/...`**  
   If the **browser** loads the app but **8787** was down or starting after Vite, **`/api/nhs/identity/bootstrap`** (and similar) failed until the **API** was up. Order of operations: **start API first**, or use **`dev:full`**, then hard-refresh.

4. **`127.0.0.1` vs `localhost` for Vite on macOS**  
   In some setups, **Vite listens on IPv6 `localhost` only**; **`curl http://127.0.0.1:5173`** can fail while **`http://localhost:5173`** works. Prefer **`localhost`** in docs and health checks when diagnosing.

5. **Remote naming confusion**  
   Local clone may have **`origin`** pointing at a **different** repo (e.g. **clinicaltempo**) while **`clinicalarc`** is the **HealthTech Protocol** canonical remote. **Always verify `git remote -v`** before pushing.

---

## 4. Open follow-ups (not fully closed)

- **More “On-chain” rows:** If Circle still returns **no** tx id in **`payment-receipt` / `payment` / JSON body**, the UI **cannot** show a per-row tx link — **data-dependent**, not a missing toggle.  
- **Header stripping:** Confirm the **Vite dev proxy** forwards **`payment-receipt` / `payment`** headers if you ever rely on **headers** for the hash (today JSON **`receiptRef`** is primary).  
- **Server `paymentReceiptRef`:** Prefer **`pay.transaction`** when present; avoid falling back to **`payer`** when the intent is a **tx hash** (addresses are not hashes).

---

## 5. References in-repo

| Resource | Role |
|----------|------|
| `docs/ARC_X402_NOTES.md` | Arc + x402 + Gateway notes |
| `.env.example` | Gateway env vars, `NHS_ENABLE_PAYMENT_GATE`, etc. |
| `HEALTHTECH_USE_CASES.md` | Behavioral contract for routes |
| `CLAWHUB.md` | Debugging / tribal knowledge |
| `public/llm-full.txt` | Regenerate: `npm run build:llm` |

---

## 6. Repository

**Primary remote:** [https://github.com/arunnadarasa/clinicalarc](https://github.com/arunnadarasa/clinicalarc)

---

*Session notes for agents and maintainers — Clinical Arc on Arc Testnet + Circle Gateway x402.*
