# OpenAPI discovery (`/openapi.json`)

Clinical Arc exposes **OpenAPI 3.1** at **`GET /openapi.json`** for tooling and agent discovery.

- **Implementation:** `server/openapi.mjs` (builds the document) + `GET /openapi.json` in `server/index.js`
- **Paid routes:** Documented with **`x-payment-info`**, **`402`** responses, and JSON **`requestBody`** schemas where required

## Local URLs

| Context | OpenAPI URL |
|--------|----------------|
| Express only | `http://localhost:8787/openapi.json` |
| Vite dev (proxied) | `http://localhost:5173/openapi.json` → 8787 |

## Validate

```bash
# Terminal 1
npm run server

# Terminal 2 (with server up)
npm run discovery
```

The **`discover`** command loads **`GET /openapi.json`** and lists routes + pricing. Keep **`DANCE_EXTRA_LIVE_AMOUNTS`** in sync in `openapi.mjs` — it is the single source imported by `server/index.js`.
