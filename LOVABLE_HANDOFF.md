# Lovable Frontend Handoff

**Full protocol narrative (A–Z) for marketing / landing pages:** see [`HEALTH_TECH_PROTOCOL_AZ.md`](./HEALTH_TECH_PROTOCOL_AZ.md) — copy blocks, CTAs, and GitHub links for Lovable or similar builders.

This project includes a working demo frontend for **legacy** Krump-style Phase 1 flows (same HealthTech Protocol payment patterns):

- Battle Entry + Auto Payout
- Coaching Minutes Marketplace
- Beat API Licensing

## Run locally

```bash
npm install
cp .env.example .env
# set OPENAI_API_KEY in .env
npm run dev:full
```

## What the UI demonstrates

- Flow switching between the 3 MVP use cases
- Step-by-step simulation for user education
- x402 intent mapping (`charge` and `session`)
- Live telemetry panel (status, receipt, session usage)
- Webhook/event visibility
- API endpoint preview for backend integration
- AI explainer action via secure backend proxy endpoint

## Files to reuse in Lovable

- `src/App.tsx` contains all demo flow logic and content.
- `src/App.css` contains component styling.
- `src/index.css` contains global styles.
- `server/index.js` contains secure server-side OpenAI proxy routes.

## Suggested Lovable prompt

Use this prompt in Lovable to recreate and extend the demo:

```text
Create a responsive product demo UI called "Clinical Tempo — HealthTech demo".
Include 3 selectable flows: "Battle Entry + Auto Payout", "Coaching Minutes Marketplace", and "Beat API Licensing".
For each flow, show:
1) title and subtitle,
2) payment intent label (charge or session),
3) 4-step ordered flow with current step highlighting,
4) primary CTA "Next Step" and secondary CTA "Restart".

Add a second card called "Live Demo Telemetry" showing:
- status (in_progress/finalized),
- receipt amount,
- session seconds,
- webhook event chips: payment.authorized, payment.finalized, session.ticked, session.closed,
- recent action log.

Add a third section called "Backend API Contract Preview" that lists flow-specific endpoints.
Use a clean white card UI on light gray background with rounded corners.

Add a fourth section called "AI Explainer (Server Proxy)" with:
- button "Generate AI Summary"
- output panel for the generated explanation text
- error state if the server has no API key
```

## Next integration step

Replace mocked step progression with real API calls to:

- create intents (`/register-intent`, `/sessions/start`, `/license-intent`)
- process x402 webhook events (`/webhooks/x402`)
- read receipts and grants
- call secure AI proxy (`POST /api/ai/explain-flow`) instead of OpenAI from frontend
