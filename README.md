# Supabase Backend

Backend-only repository for the ASR Collection checkout and Duitku POP payment integration.

## Scope

- PostgreSQL schema and payment RPC functions
- Supabase Edge Functions for invoice creation, Duitku callbacks, and order status
- Unit and contract tests

## Status

This repository is a source-code workspace. SQL files are not applied automatically, Edge Functions are not deployed automatically, and no payment credentials are stored in this repository.

See `database/README.md` and `edge-functions/README.md` for component-specific notes.