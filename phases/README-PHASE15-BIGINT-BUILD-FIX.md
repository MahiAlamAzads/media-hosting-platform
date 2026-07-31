# Phase 15 BigInt Build Fix

This targeted compatibility patch fixes Next.js/TypeScript builds whose
frontend compiler target is lower than ES2020.

It replaces frontend BigInt literal syntax such as:

```ts
0n
100n
```

with target-compatible constructor syntax:

```ts
BigInt(0)
BigInt(100)
```

Files fixed:

- `apps/web/src/app/dashboard/billing/pay-as-you-go/page.tsx`
- `apps/web/src/components/usage-warning-banner.tsx`
- `apps/web/src/lib/billing-format.ts`
- `apps/admin/src/lib/billing-format.ts`

The admin formatter is included proactively because the root typecheck stops
at the web package before reaching the admin package.

No billing calculations, PAYG behavior, currency formatting, database schema,
API contracts, media delivery or CDN URLs are changed.

Validate with:

```bash
pnpm typecheck
pnpm test
pnpm build
```
