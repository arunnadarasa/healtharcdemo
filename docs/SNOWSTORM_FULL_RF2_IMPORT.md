# Snowstorm: full SNOMED CT RF2 import (hackathon runbook)

Use this when you want **local FHIR `$lookup`** against `http://snomed.info/sct` for the demo (deadline-friendly, but still hours on a laptop for a **full edition**).

**Official upstream:** [IHTSDO Snowstorm — loading SNOMED](https://github.com/IHTSDO/snowstorm/blob/master/docs/loading-snomed.md).

## Licences and files

- Obtain RF2 zips **only through channels your licence allows** (e.g. [SNOMED International](https://www.snomed.org/get-snomed), NHS **TRUD** for UK editions).
- This repo does **not** ship SNOMED content.

## What “full” means (pick deliberately)

| Import `type` | What you get | Typical time (order of magnitude) |
|---------------|--------------|-----------------------------------|
| **`SNAPSHOT`** | **All active + inactive components for the current release** (recommended for dev/demo) | Often **~30–90+ min** on a fast desktop; **much longer** on constrained RAM/disk. |
| **`FULL`** | **Full history** (all prior states), not needed for most demos | **Many hours** (Snowstorm docs cite **~2h15** on an **m5.xlarge** for one historical run; laptops can be worse). |

For the **26 Apr submission**, prefer **`SNAPSHOT`** of the edition you actually demo (**International** vs **UK** per your licence and UI story). Reserve **`FULL`** only if you explicitly need historical states.

## Prerequisites

1. **Docker Desktop** running with enough RAM for Elasticsearch + Snowstorm (compose defaults: **2 GiB ES heap**, **2 GiB Snowstorm** — see `docker-compose.snowstorm.yml`). If imports fail with OOM or shard errors, increase Docker’s memory limit and optionally raise `-Xmx` in that file.
2. Start the stack from the repo root:
   ```bash
   npm run snowstorm:up
   ```
3. Wait until Snowstorm answers (can take **1–3 minutes** after ES is healthy):
   ```bash
   curl -sS "http://127.0.0.1:8081/actuator/health"
   ```
4. Point the app API at Snowstorm (shell or `.env`):
   ```bash
   export SNOWSTORM_URL="http://127.0.0.1:8081"
   ```

This project maps host **`8081` → Snowstorm** (not `8080`). Replace `8081` below if you changed the compose port.

## Clean slate vs resume

- **Corrupt / stuck indices** (e.g. `no_shard_available` after a bad run): from repo root, reset **only** this compose project’s volume (this **wipes** local SNOMED data in that volume):
  ```bash
  docker compose -f docker-compose.snowstorm.yml down -v
  npm run snowstorm:up
  ```
- **Do not** `down -v` while an import is still `RUNNING` unless you intend to start over.

## REST import (recommended)

### 1) Create an import job

```bash
curl -sS -X POST "http://127.0.0.1:8081/imports" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "branchPath": "MAIN",
    "createCodeSystemVersion": true,
    "type": "SNAPSHOT"
  }'
```

Copy the returned **`id`** (UUID).

**UK / dependent editions:** some packages require an **International** snapshot (or a specific dependency order) before loading a national extension. Follow the **release notes** for your TRUD zip; branch paths can differ from bare `MAIN`.

### 2) Upload the RF2 release zip

Use the **exact** filename of your downloaded release:

```bash
IMPORT_ID="<paste-import-uuid-here>"
ZIP="/absolute/path/to/SnomedCT_SnapshotOrProduction_....zip"

curl -sS -X POST "http://127.0.0.1:8081/imports/${IMPORT_ID}/archive" \
  -H "Accept: application/json" \
  -F "file=@${ZIP}"
```

### 3) Poll until finished

```bash
npm run snowstorm:poll-import -- "$IMPORT_ID"
```

Or manually:

```bash
curl -sS "http://127.0.0.1:8081/imports/${IMPORT_ID}" | jq .
```

Wait for a **terminal** status (wording varies by Snowstorm version; treat **`COMPLETED`** / **`DONE`** as success and **`FAILED`** as failure — read `message` / logs).

### 4) Verify from the hackathon API

With `SNOWSTORM_URL` set and `npm run server` (or `npm run dev:full`):

```bash
curl -sS "http://127.0.0.1:8787/api/snomed/health" | jq .
curl -sS "http://127.0.0.1:8787/api/snomed/lookup/73211009" | jq .
```

If lookup returns **404** / `not-found` for codes that exist in the **NHS Browser**, your Snowstorm branch likely does not contain the **same edition** as that browser (common with partial UK loads).

## Monitoring and logs

```bash
docker compose -f docker-compose.snowstorm.yml logs -f snowstorm
docker compose -f docker-compose.snowstorm.yml logs -f elasticsearch
```

## Stop stack (keep data)

```bash
npm run snowstorm:down
```

(`docker compose down` without `-v` keeps the named volume.)

## References

- Snowstorm loading doc: https://github.com/IHTSDO/snowstorm/blob/master/docs/loading-snomed.md  
- Delta vs snapshot note: use **SNAPSHOT** zips for imports; see same doc for **delta generator** caveats.  
- Repo learnings: `docs/CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md` (Snowstorm UK import pitfalls).
