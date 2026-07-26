# Phase 1 Neon Completion Patch

This patch completes the missing Neon/Prisma 7 runtime integration.

## Required environment values

Use the Neon pooled connection URL as `DATABASE_URL`.

Use the direct Neon connection URL as `DIRECT_URL` when available. The migration configuration falls back to `DATABASE_URL` when `DIRECT_URL` is absent.

Media files remain on the configured local SSD/HDD path. Neon stores only application metadata.

## Verification

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:check
pnpm typecheck
pnpm build
```

Phase 1 is complete only when all commands pass and the authentication flow is tested with working SMTP credentials.
