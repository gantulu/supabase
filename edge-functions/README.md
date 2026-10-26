# Edge Functions

Deno-based Supabase Edge Functions for the Duitku POP integration.

## Official contract

Read [`docs/duitku-pop-integration.md`](../docs/duitku-pop-integration.md) and the [official Duitku POP docs](https://docs.duitku.com/pop/id/) before changing provider request fields or payment state logic.

## Functions

- `duitku-create-invoice/` — request validation entry point; invoice creation remains disabled until trusted order persistence and idempotency RPC are wired.
- `duitku-callback/` — validates the documented `application/x-www-form-urlencoded` callback signature; durable amount reconciliation and callback RPC are still required before acknowledgement.
- `order-status/` — returns the minimum order/payment status to an authorized guest or user once authorization is implemented.

## Security requirements

- Keep the service-role key and Duitku API key in server-side function secrets only.
- Do not accept client-supplied prices or totals as authoritative.
- Use database transactions/RPCs for idempotency, stock changes, and payment state transitions.
- The callback docs conflict on failure result code (`01` vs `02`); unknown or conflicting callback outcomes must become `needs_review`, not an inferred `failed`.
- Browser JavaScript callback events are for UI feedback only and must never change authoritative payment state.
- Do not deploy until official callback result-code ambiguity, database persistence, and integration tests are resolved.
