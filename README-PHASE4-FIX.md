# Phase 4 compile and test fix

Fixes:

- Narrows API-key regex captures before returning them.
- Forces deterministic valid test environment values.
- Prevents an invalid development SMTP sender address from breaking Vitest imports.
- Preserves `.env`, migrations, storage and PostgreSQL data.

Run:

```bash
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
```
