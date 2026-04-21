# Troubleshooting (Clinical Arc)

## x402 / `402` loops

- **Symptom:** The frontend repeatedly encounters `402` or cannot recover from an auth challenge.
- **Fix:** Read **`CLAWHUB.md`**; trace the specific route in **`server/index.js`**. Confirm **Arc Testnet** (chain id **5042002**) and wallet funding.

## OpenAPI / `npm run discovery` fails or shows warnings

- **Fix:** Start **`npm run server`** (**8787**). Confirm **`GET /openapi.json`** returns JSON. **`DANCE_EXTRA_LIVE_AMOUNTS`** must be edited only in **`server/openapi.mjs`** (imported by **`server/index.js`**). See **`docs/OPENAPI_DISCOVERY.md`**. If port **8787** is already taken by a stale process, use another **`PORT`** or kill the old **`node`** process.
