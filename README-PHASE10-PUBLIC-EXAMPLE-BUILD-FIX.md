# Phase 10 Public Example Build Fix

Next.js was type-checking the downloadable example:

`apps/web/public/examples/nextjs-upload-route.ts`

because the web TypeScript configuration includes every `*.ts` file under the
application directory.

This patch adds:

```json
"exclude": [
  "node_modules",
  "public/examples/**/*"
]
```

The example remains publicly downloadable from the same URL and keeps its
`.ts` filename. Only the project's build/type-check input is changed.

No API, database, authentication, billing, payment, CDN, example content, or
runtime behavior is changed.

## Validate

```bash
pnpm typecheck
pnpm test
pnpm build
```
