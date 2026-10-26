# Supabase Backend

Backend-only repository for the ASR Collection checkout and Duitku POP payment integration.

## Scope

- PostgreSQL schema and payment RPC functions
- Supabase Edge Functions for invoice creation, Duitku callbacks, and order status
- Unit and contract tests

## Duitku POP source of truth

Use the [official Duitku POP documentation](https://docs.duitku.com/pop/id/) as the source of truth. The repository's reviewed contract, implementation mapping, and known protocol discrepancy are recorded in [`docs/duitku-pop-integration.md`](docs/duitku-pop-integration.md).

## Status

This repository is a source-code workspace. SQL files are not applied automatically, Edge Functions are not deployed automatically, and no payment credentials are stored in this repository. Invoice orchestration and durable callback state transitions remain disabled until their database RPCs and integration tests are implemented. The official docs currently conflict on the callback failure result code; unknown outcomes must remain under review.

See `database/README.md` and `edge-functions/README.md` for component-specific notes.
