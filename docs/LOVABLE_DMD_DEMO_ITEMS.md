# dm+d demo items for Lovable (sample `q` / optional `code`)

Use this as a **static seed list** for Lovable when you already have **wardle/dmd** (or compatible) behind **`DMD_SERVICE_URL`**. Each row is a **free-text search** (`q`) suitable for:

- **`GET /api/dmd/search?q=...`** (and optional `&code=...`)
- **`POST /api/dmd/lookup`** — same `{ q, code }` in JSON (paid x402)
- **`POST /api/dmd/summary`** — same body + **`FEATHERLESS_API_KEY`** on server for LLM narrative

## Naming (important)

Upstream **`wardle/dmd`** search can be **strict** on spelling/case. Prefer **Title Case** ingredient names (e.g. **Amlodipine**). This repo’s `/api/dmd/search` tries several variants and returns **`attemptedQueries`** / **`matchedQuery`** for debugging.

## Optional `code` column

If you populate **`code`**, the server calls **`GET …/dmd/v1/product/{code}`** (SNOMED-style dm+d identifier from **your** TRUD load). Codes **differ by release** — if a code 404s, use **`q` only** for demos.

## Table (copy-friendly)

| id | Label | `q` (search) | `code` | Category |
|----|--------|--------------|--------|----------|
| dmd-001 | Paracetamol | Paracetamol | *(empty)* | Analgesic |
| dmd-002 | Ibuprofen | Ibuprofen | *(empty)* | NSAID |
| dmd-003 | Aspirin | Aspirin | *(empty)* | Antiplatelet |
| dmd-004 | Metformin | Metformin | *(empty)* | Antidiabetic |
| dmd-005 | Amlodipine | Amlodipine | *(empty)* | Calcium channel blocker |
| dmd-006 | Atorvastatin | Atorvastatin | *(empty)* | Lipid lowering |
| dmd-007 | Omeprazole | Omeprazole | *(empty)* | PPI |
| dmd-008 | Salbutamol | Salbutamol | *(empty)* | Bronchodilator |
| dmd-009 | Amoxicillin | Amoxicillin | *(empty)* | Antibiotic |
| dmd-010 | Warfarin | Warfarin | *(empty)* | Anticoagulant |
| dmd-011 | Levothyroxine | Levothyroxine | *(empty)* | Thyroid |
| dmd-012 | Bisoprolol | Bisoprolol | *(empty)* | Beta blocker |
| dmd-013 | Sertraline | Sertraline | *(empty)* | SSRI |
| dmd-014 | Morphine | Morphine | *(empty)* | Opioid analgesic |
| dmd-015 | Insulin glargine | Insulin glargine | *(empty)* | Insulin |

## Machine-readable files

- `docs/LOVABLE_DMD_DEMO_ITEMS.json`
- `docs/LOVABLE_DMD_DEMO_ITEMS.csv`

## One-line prompt for Lovable

> Seed the dm+d demo from `docs/LOVABLE_DMD_DEMO_ITEMS.json`: render each item’s `label` + `q`; on select, call `GET /api/dmd/search?q=encodeURIComponent(q)` (or paid `POST /api/dmd/lookup` with wallet). Use Title Case `q` as given.
