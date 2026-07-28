# Phase 14 — Dual Revenue Billing and Prepaid PAYG

Phase 14 adds two user-selectable revenue models while retaining Enterprise as
a custom sales workflow.

## Subscription revenue

- Free
- 3 months
- 6 months
- 1 year
- Enterprise custom agreement

Paid subscription offers create invoices and can be paid through the existing
manual-payment or SSLCOMMERZ workflows. Included usage is still measured in
monthly service periods while the commercial commitment can span 3, 6 or 12
months.

## Prepaid PAYG revenue

PAYG cannot be activated until the workspace has topped up at least the
configured minimum. Every selected billable operation reserves and debits the
wallet atomically before the operation is allowed. An unselected meter remains
hard-limited.

Top-up invoices use the existing manual-payment and SSLCOMMERZ payment flows.
No raw card number, CVV, PIN or OTP is stored.

## Enterprise

Enterprise users submit requirements and enter a managed sales pipeline. A
platform administrator can update status and internal notes.

## Admin controls

The separate admin console adds complete user create/read/update/soft-delete,
password reset, email verification, suspension, session revocation, workspace
visibility, wallet credits/debits with audit reasons and Enterprise inquiry
management.

## New pages

Workspace:

- `/dashboard/billing/revenue-model`
- `/dashboard/billing/plans`
- `/dashboard/billing/pay-as-you-go`
- `/dashboard/billing/enterprise`

Admin:

- `/users`
- `/users/:userId`
- `/wallets`
- `/enterprise-inquiries`

## Environment

```env
PAYG_MINIMUM_TOPUP_BDT_MINOR=50000
PAYG_MINIMUM_TOPUP_USD_MINOR=500
PAYG_LOW_BALANCE_BDT_MINOR=10000
PAYG_LOW_BALANCE_USD_MINOR=100
ENTERPRISE_SALES_EMAIL=sales@example.com
```
