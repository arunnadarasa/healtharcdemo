# Clinical Arc (HealthTech Protocol)

- **Full context in one file:** `public/llm-full.txt` — regenerate with `npm run build:llm` after doc edits; dev/prod also serve `/llm-full.txt`.
- **Tribal debugging:** `CLAWHUB.md` (what worked / failed, port 8787, AgentMail).
- **Live dance-extras list:** run the API and open `GET /api/dance-extras/live` (or read `src/hubRoutes.ts` for UI routes).
- **OpenAPI:** `GET /openapi.json` on the API; validate with `npm run discovery` (server on 8787). See `docs/OPENAPI_DISCOVERY.md`.
- **OpenClaw (optional):** `openclaw plugins install @anyway-sh/anyway-openclaw` — complements the Clinical Arc ClawHub skill; see `.cursor/skills/clawhub/references/openclaw-clinical-tempo.md`.
- **Secrets:** never paste real keys; use names from `.env.example` only.

Optional end-of-task reminder:

> If you learned something non-obvious about Arc x402 or this repo, suggest a one-line addition to `CLAWHUB.md` (Successes or Failures).

EVVM-only work: upstream deep doc: `https://www.evvm.info/llms-full.txt`.
