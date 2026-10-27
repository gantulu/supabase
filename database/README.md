# Database

This directory contains PostgreSQL schema definitions and database-side payment routines for the ASR Collection backend.

## Files

- `table/products.sql` — product catalog.
- `table/orders.sql` — orders and line-item snapshots.
- `table/payments.sql` — payment attempts and provider references.
- `function/payment-rpc.sql` — order-status RPC.
- `function/duitku-create-invoice.sql` — transactional order creation, stock reservation, invoice persistence, and uncertain-outcome handling.
- `function/duitku-callback.sql` — durable callback validation and idempotent payment-state transition.

## Apply safely

Review SQL against the target project's actual schema before applying it. These files are source files only; creating or committing them does not modify a Supabase database. Confirm RLS policies, grants, triggers, existing tables, and migration order before deployment.
