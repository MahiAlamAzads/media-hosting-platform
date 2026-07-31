# Phase 9 — Manual payment, SSLCOMMERZ and paid renewals

Phase 9 adds two payment paths to the Phase 8 dual-currency billing system:

1. Manual payment submission with configurable BDT/USD accounts, transaction references, sender details, local proof storage and platform-admin approval or rejection.
2. SSLCOMMERZ hosted checkout with server-side session creation, IPN handling, Order Validation API verification, amount/currency/reference validation, risk review and reconciliation.

The same row-locked payment-application transaction activates both payment methods. Paid plans also receive renewal invoices before the current period ends. An unpaid renewal enters grace period and then past-due state instead of renewing for free.

## Environment

```env
API_PUBLIC_URL=https://api.example.com
MANUAL_PAYMENT_ENABLED=true
MANUAL_PAYMENT_PROOF_REQUIRED=true
MANUAL_PAYMENT_PROOF_MAX_BYTES=5242880
SSLCOMMERZ_ENABLED=false
SSLCOMMERZ_SANDBOX=true
SSLCOMMERZ_STORE_ID=
SSLCOMMERZ_STORE_PASSWORD=
SSLCOMMERZ_AUTO_APPROVE_RISKY=false
PAYMENT_RENEWAL_LEAD_DAYS=7
PAYMENT_GRACE_DAYS=7
```

Set `SSLCOMMERZ_ENABLED=true` only after sandbox credentials are configured. Callback URLs are derived from `API_PUBLIC_URL`. It must be a publicly reachable URL; use an HTTPS tunnel for local sandbox callbacks. Live callbacks require HTTPS.

## Payment and renewal behavior

- A paid plan request creates a `PLAN_CHANGE` invoice.
- A daily job creates a `RENEWAL` invoice before a paid period ends.
- Payment before renewal is stored as paid and applied when the current period ends.
- Payment during grace immediately reactivates the subscription.
- Free plans continue to renew without an invoice.
- Unpaid paid plans move from `ACTIVE` to `GRACE_PERIOD`, then `PAST_DUE`.
- Renewal invoices remain payable so a past-due workspace can recover service.
- Cancelling or superseding a plan request also cancels its active payment attempts and voids its invoice.

## Security properties

- The browser never receives the SSLCOMMERZ store password.
- The backend calculates invoice prices from immutable plan versions.
- IPN and browser return values are never trusted by themselves.
- Successful transactions are checked with the SSLCOMMERZ Order Validation API.
- Transaction ID, invoice ID, workspace ID, original currency and original amount must match.
- USD verification uses original currency and original amount fields when supplied by the gateway.
- Risk-level 1 transactions remain under administrator review unless explicitly configured otherwise.
- Payment application is idempotent and locks the invoice row.
- Manual proof files remain under `MEDIA_STORAGE_ROOT/tenants/<workspace>/payment-proofs`.

## New pages

- `/dashboard/billing/payments`
- `/dashboard/billing/payments/[invoiceId]`
- `/dashboard/admin/payments`
- `/dashboard/admin/payment-accounts`

## Scheduled jobs

```bash
pnpm payments:generate-renewals
pnpm payments:expire-invoices
pnpm payments:reconcile-sslcommerz
pnpm subscriptions:renew-periods
```

Recommended production cadence:

- Generate renewal invoices daily.
- Expire plan-change invoices daily.
- Reconcile SSLCOMMERZ every 15 minutes.
- Process subscription period transitions hourly or daily.
