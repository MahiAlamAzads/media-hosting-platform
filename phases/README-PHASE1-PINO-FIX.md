# Phase 1 final compile fix

This patch:

- Uses the named `pinoHttp` export exposed by the installed `pino-http` type declarations.
- Allows only required native/build-time dependency scripts through pnpm.
- Preserves `.env`, migrations, storage and database data.

Verification:

```bash
pnpm install
pnpm rebuild argon2
pnpm db:generate
pnpm db:check
pnpm typecheck
pnpm build
```
