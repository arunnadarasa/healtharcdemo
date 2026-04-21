# Clinical Arc — concrete examples

## OpenAPI (server must run)

```bash
curl -sS http://localhost:8787/openapi.json | head
```

## Smoke: live x402 routes (server must run)

```bash
curl -sS http://localhost:8787/api/dance-extras/live
```

From **`.env.example`**: `X402_SELLER_ADDRESS`, integration base URLs (`OPENAI_X402_GATEWAY_URL`, `AGENTMAIL_*`, etc.). **Do not** put real secrets in agent prompts.
