/**
 * Clinical Arc / ClawHub — OpenClaw bootstrap hook
 * @see HOOK.md in this folder
 */

export const SYSTEM_PROMPT_APPEND = `
## Clinical Arc context (ClawHub skill)

**Published skill:** https://clawhub.ai/arunnadarasa/clinicalarc

**Full repo orientation:** \`public/llm-full.txt\` (or \`/llm-full.txt\` from a running dev server).

**Tribal debugging:** \`CLAWHUB.md\` (successes, failures, port **8787**, AgentMail).

**OpenAPI:** \`GET /openapi.json\` — validate: \`npm run discovery\` (server on 8787).

**Smoke:** \`GET http://localhost:8787/api/dance-extras/live\` → JSON with \`flowKeys\`.
`
