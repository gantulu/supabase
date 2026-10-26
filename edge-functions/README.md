# Edge Functions

Deno-based Supabase Edge Functions for the Duitku POP integration.

## Functions

- `duitku-create-invoice/` — validates checkout input and creates an invoice through the provider.
- `duitku-callback/` — receives provider callbacks; must verify signature, merchant order ID, and amount before any state transition.
- `order-status/` — returns the minimum order/payment status to an authorized guest or user.

## Security requirements

- Keep the service-role key and Duitku API key in server-side function secrets only.
- Do not accept client-supplied prices or totals as authoritative.
- Use database transactions/RPCs for idempotency, stock changes, and payment state transitions.
- Unknown or conflicting callback outcomes must become `needs_review`, not an inferred `failed`.
- Do not deploy until official callback/inquiry contract blockers and integration tests are resolved.
