# Supabase Backend

Backend-only repository for the ASR Collection checkout and Duitku POP payment integration.

## Scope

- PostgreSQL schema and payment RPC functions
- Supabase Edge Functions for invoice creation, Duitku callbacks, and order status
- Unit and contract tests

## Duitku POP source of truth

Use the [official Duitku POP documentation](https://docs.duitku.com/pop/id/) as the source of truth. The repository's reviewed contract, implementation mapping, and known protocol discrepancy are recorded in [`docs/duitku-pop-integration.md`](docs/duitku-pop-integration.md).

## Status

This repository is a source-code workspace. Duitku invoice creation, transactional order/payment RPCs, and durable callback processing are implemented as source files on the feature branch, but SQL has not been applied and Edge Functions have not been deployed or integration-tested. No payment credentials are stored in this repository. The official POP docs conflict on the callback failure result code (`01` vs `02`); non-`00` outcomes remain `needs_review` until Duitku confirms the contract.

See `database/README.md` and `edge-functions/README.md` for component-specific notes.
