# Artificial HES at scale — Lovable sample bundle (CSV + JSON + MD)

Synthetic **AE / OP / APC** rows in **NHS artificial HES CSV shape** for neighbourhood + HES scale demos. **Not real patients** — hackathon / prototype only.

## What ships in git

| Kind | Path |
|------|------|
| **This guide** | `docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.md` |
| **Preset API + ingest manifest** | `docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.json` |
| **Flat scenarios (spreadsheets)** | `docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.csv` |
| **Full ingestable CSVs** | `examples/lovable-artificial-hes/csv/ae|op|apc/*.csv` (regenerate: `npm run hes:generate-lovable-sample`) |

## Load SQLite (one-time per environment)

```bash
export HES_CLEAR_FIRST=1
export HES_AE_DIR="$(pwd)/examples/lovable-artificial-hes/csv/ae"
export HES_OP_DIR="$(pwd)/examples/lovable-artificial-hes/csv/op"
export HES_APC_DIR="$(pwd)/examples/lovable-artificial-hes/csv/apc"
npm run ingest:hes
npm run hes:rebuild-fts
```

DB defaults to **`data/neighbourhood-hes.db`** (gitignored). Set **`HES_SQLITE_PATH`** if needed.

## Preset API scenarios

Use **`docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.json`** — `scenarios[]` includes bodies for paid **`POST /api/neighbourhood/insights/lsoa`**, **`/insights/summary`**, **`/scale/search`**, **`/scale/cross-summary`** (wallet + x402 on the client; see `src/nhsApi.ts`).

**`docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.csv`** is the same scenarios in one row per scenario for Sheets / Notion.

## Performance note (important for demos)

- **Empty `lsoa`** on paid LSOA aggregate = **full-table** `GROUP BY` over all AE rows → very slow on large ingests.  
- Prefer a **concrete LSOA** (e.g. **`E01022770`**) for snappy paid demos.  
- Details: [`docs/CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md`](./CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md) pitfall **#17**.

## Official “at scale” data (millions of rows)

For judge-scale volume, download **[NHS Digital — Artificial data](https://digital.nhs.uk/services/artificial-data)** releases and point **`HES_*_DIR`** at the extracted folders instead of this sample.

## One-line Lovable prompt

> Ingest HES from `examples/lovable-artificial-hes/csv/` using env vars in `docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.md`, then wire paid neighbourhood buttons from `docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.json` `scenarios` (wallet session + `network` on each POST body).
