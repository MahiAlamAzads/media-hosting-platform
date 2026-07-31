# Phase 11 — Separate Advanced Admin Console

## Applications

- Workspace app: `http://localhost:3000`
- API: `http://localhost:4000`
- Admin console: `http://localhost:3002`

Production recommendation:

- `https://alamahi.cloud`
- `https://api.alamahi.cloud`
- `https://admin.alamahi.cloud`

## Access model

The admin console uses the existing verified user account and rotating refresh
session, then checks `PLATFORM_ADMIN_EMAILS` on the API for every admin request.
API keys cannot access admin routes.

## Modules

- Platform overview
- User search, suspension/reactivation and session revocation
- Workspace search and suspension/reactivation
- Plan/version management
- Subscription management
- Manual payment review and payment accounts
- Platform usage
- Upload/processing/payment operations
- Global audit trail
- Security events
- Database/storage/runtime system health

## Local environment

```env
WEB_URL=http://localhost:3000
ADMIN_WEB_URL=http://localhost:3002
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3002
NEXT_PUBLIC_WORKSPACE_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002
PLATFORM_ADMIN_EMAILS=mahialamazad.bd@gmail.com
```

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```
