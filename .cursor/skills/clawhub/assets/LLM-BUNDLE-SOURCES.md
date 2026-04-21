# Sources concatenated into `public/llm-full.txt`

**Generator:** `scripts/build-llm-full.mjs`  
**Command:** `npm run build:llm` (also runs before `npm run build`)

Order matters for LLM context — matches the script’s `FILES` array:

| # | Repo path |
| --- | --- |
| 1 | `README.md` |
| 2 | `CLAWHUB.md` |
| 3 | `HEALTHTECH_USE_CASES.md` |
| 4 | `HEALTH_TECH_PROTOCOL_AZ.md` |
| 5 | `docs/ARC_X402_NOTES.md` |
| 6 | `docs/OPENAPI_DISCOVERY.md` |
| 7 | `docs/OWS_NHS.md` |

**Do not** hand-edit `public/llm-full.txt`. Edit the sources above, then regenerate.

**Not included:** `https://www.evvm.info/llms-full.txt` (upstream EVVM — attach separately when needed).
