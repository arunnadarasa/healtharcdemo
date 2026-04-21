# Arc Testnet + Circle Gateway x402

- **Chain:** Arc Testnet, id **5042002** (`eip155:5042002` in challenges).
- **Payments:** [Circle Gateway nanopayments](https://developers.circle.com/gateway/nanopayments) with the **x402** HTTP payment protocol.
- **Faucet:** [Circle Faucet](https://faucet.circle.com) for test USDC and gas — the app’s **Get testnet funds** button links to this flow.
- **Explorer:** [testnet.arcscan.app](https://testnet.arcscan.app).

NHS and demo routes that require payment use **`createGatewayMiddleware`** on the server and **`wrapFetchWithPayment`** / batch schemes in the browser (`src/arcX402Fetch.ts`, `src/nhsArcPaidFetch.ts`).

Seller address and related settings follow **`X402_SELLER_ADDRESS`** and `.env.example`.

## Gateway balance (batched x402)

Circle’s [Arc nanopayments sample](https://github.com/circlefin/arc-nanopayments) deposits USDC into the **Gateway Wallet** before `gateway.pay` / x402 settlement. Clinical Arc mirrors that: before a paid NHS or dance-extras request, **`ensureGatewayDepositForX402`** (`src/arcGatewayDeposit.ts`) checks [Gateway testnet balances](https://gateway-api-testnet.circle.com) and, if below the minimum, runs **ERC‑20 approve + `deposit`** on `0x0077777d…` (same contracts as `@circle-fin/x402-batching`).

Optional Vite env: **`VITE_GATEWAY_MIN_AVAILABLE_USDC`** (default `0.5`), **`VITE_GATEWAY_TOPUP_USDC`** (default `1`), **`VITE_GATEWAY_SKIP_AUTO_DEPOSIT=true`** to disable the auto top-up (debug only).

Background: [Gateway + x402 for machine-scale micropayments](https://www.circle.com/blog/enabling-machine-to-machine-micropayments-with-gateway-and-usdc); [Circle Wallets + x402 autonomous payments](https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402) (different facilitator example, same HTTP 402 idea).

## Thirdweb facilitator (alternate path)

When **`X402_FACILITATOR=thirdweb`**, the stack uses **`settlePayment`** + **`@x402/fetch`** Exact EVM instead of Circle Gateway batching. **Payload-shape and receipt UX** differ — see **`docs/CLINICALARC_X402_LEARNINGS_AND_BEST_PRACTICES.md`** (success **#6–#7**, pitfalls **#2–#3**).
