# Phase 8 — Dual-Currency Plans, Limits and Usage Metering

Authoritative baseline ZIP SHA-256:

`49c13a9695f928315bbe93a6c11c63d4907a62b59a66824c9dfe36aff91fd92b`

This phase keeps the Bootstrap `main` frontend and adds a database-driven BDT/USD pricing, subscription, entitlement, quota and usage foundation.

## Commercial behavior

- BDT and USD are independent price books. No live exchange-rate conversion is used.
- Monthly and yearly prices are stored as integer minor units: poisha or cents.
- Paid plan requests require manual platform-administrator approval in Phase 8.
- No payment is collected and no gateway is activated in this phase.
- Currency changes are scheduled for the next renewal when requested from the workspace billing screen.

## Seeded plans

| Plan | BDT monthly | BDT yearly | USD monthly | USD yearly |
|---|---:|---:|---:|---:|
| Free | ৳0 | ৳0 | $0 | $0 |
| Starter | ৳990 | ৳9,900 | $9 | $90 |
| Pro | ৳2,990 | ৳29,900 | $29 | $290 |
| Business | ৳9,900 | ৳99,000 | $99 | $990 |

## Database additions

- `Plan`
- `PlanVersion`
- `PlanPrice`
- `PlanEntitlement`
- `WorkspaceSubscription`
- `BillingPreference`
- `UsageEvent`
- `UsageAggregate`
- `QuotaReservation`
- `UsageAlert`
- `SubscriptionChange`

The migration is append-only. Existing media, auth, session, API-key and variant tables are preserved.

Existing workspaces are assigned the Free plan and BDT monthly billing preference. Their existing `storageLimitBytes` remains grandfathered when it exceeds the Free storage entitlement. New workspaces use the 2 GB Free storage limit.

## Enforced entitlements

- Storage bytes
- Monthly delivery bytes
- Monthly upload bytes
- Monthly API requests
- Image transformations
- Video processing seconds
- Processing CPU milliseconds
- Active assets
- Folders
- Workspace members
- Active API keys
- Concurrent jobs
- Maximum file size

Upload initialization now reserves storage and monthly upload capacity inside a PostgreSQL transaction while locking the workspace quota row. Restore, folder creation, API-key creation and image processing also enforce their corresponding limits.

## Usage accounting

Usage events are immutable and idempotent. Current-period aggregates power the billing dashboard and projections. Storage and count gauges are read from authoritative workspace/entity state.

Threshold states:

- 70%: notice
- 85%: warning and email job eligibility
- 100%: exceeded

## New public and workspace routes

- `GET /api/v1/pricing?currency=BDT|USD`
- `GET /api/v1/billing/subscription`
- `GET /api/v1/billing/usage`
- `GET /api/v1/billing/limits`
- `GET /api/v1/billing/projection`
- `GET /api/v1/billing/plans`
- `GET|PATCH /api/v1/billing/settings`
- `POST /api/v1/billing/select-plan`
- `POST /api/v1/billing/change-currency`
- `POST /api/v1/billing/cancel-change`
- `GET /api/v1/billing/alerts`
- `PATCH /api/v1/billing/alerts/:alertId`

## Platform-admin routes

- Plan catalogue and plan identity management
- Immutable plan-version creation
- Publish and retire plan versions
- Subscription list and manual activation/scheduling
- Reject pending plan requests
- Platform usage aggregates

Platform-admin routes require a signed-in user whose normalized email is listed in `PLATFORM_ADMIN_EMAILS`.

Example:

```env
PLATFORM_ADMIN_EMAILS=owner@example.com,billing-admin@example.com
```

## New Bootstrap pages

- `/pricing`
- `/dashboard/billing`
- `/dashboard/billing/usage`
- `/dashboard/billing/plans`
- `/dashboard/billing/settings`
- `/dashboard/admin/plans`
- `/dashboard/admin/plans/:planId`
- `/dashboard/admin/subscriptions`
- `/dashboard/admin/usage`

The Platform admin navigation group is shown only when `/api/v1/account/me` confirms the signed-in email is in the allowlist.

## Operational jobs

```bash
pnpm usage:aggregate
pnpm usage:reconcile
pnpm quota:release-expired
pnpm subscriptions:renew-periods
pnpm usage:send-alerts
```

Suggested production schedule:

- Every 15 minutes: `quota:release-expired`
- Hourly: `usage:aggregate`
- Daily: `usage:reconcile`
- Daily: `usage:send-alerts`
- Daily: `subscriptions:renew-periods`

## Validation

```bash
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm db:check
pnpm typecheck
pnpm test
pnpm build
pnpm usage:reconcile
pnpm usage:aggregate
```

Full database migration, generated Prisma types, tests and production build must be run in the target project environment before the phase is considered complete.
