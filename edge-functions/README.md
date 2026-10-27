# Edge Functions

Deno-based Supabase Edge Functions for the Duitku POP integration.

## Official contract

Read [`docs/duitku-pop-integration.md`](../docs/duitku-pop-integration.md) and the [official Duitku POP docs](https://docs.duitku.com/pop/id/) before changing provider request fields or payment state logic.

## Functions

- `duitku-create-invoice/` — validates guest checkout input, creates an order and reserves stock through a transactional RPC, signs the Create Invoice request, and persists the provider reference/payment URL.
- `duitku-callback/` — validates the form-urlencoded callback signature, reconciles merchant/order/reference/amount, persists the result through a transactional RPC, and only then acknowledges HTTP 200.
- `order-status/` — returns the minimum order/payment status to an authorized guest or user once authorization is implemented.

## Security requirements

- Keep the service-role key and Duitku API key in server-side function secrets only.
- Do not accept client-supplied prices or totals as authoritative.
- Use database transactions/RPCs for idempotency, stock changes, and payment state transitions.
- The official callback docs conflict on failure result code (`01` vs `02`); all non-`00` callback results remain `needs_review`, not an inferred `failed`.
- `DUITKU_ENVIRONMENT`, `DUITKU_MERCHANT_CODE`, `DUITKU_API_KEY`, `DUITKU_CALLBACK_URL`, `DUITKU_RETURN_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` must be configured as server-side secrets/environment. Set `APP_ORIGIN` to the exact frontend origin in production.
- Duitku's server callback cannot provide a Supabase user JWT; configure `duitku-callback` with JWT verification disabled at deployment (for example, the CLI `--no-verify-jwt` option) and rely on HMAC verification plus database reconciliation. If guest checkout calls `duitku-create-invoice` without a Supabase JWT, configure it accordingly too. Add server-side rate limiting/abuse controls before exposing invoice creation publicly.
- The invoice function accepts `idempotency_key` (16–200 chars), `customer`, `shipping_address`, `items` (`productId`, `quantity`), and optional integer `shipping_cost`. It does not accept client-supplied prices or totals.
- Pending orders reserve stock. There is no automated expiry/release job in this V1; reconcile stale orders before production.
- Browser JavaScript callback events and return-page query parameters are UI-only and must never change authoritative payment state.
- Source implementation has not been applied to a live database or deployed. Run SQL/function tests and resolve the callback result-code discrepancy before production use.
