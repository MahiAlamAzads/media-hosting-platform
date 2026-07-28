# Phase 19 — Admin Billing Control Center

Adds a consolidated platform-admin billing queue and safe manual controls.

## Admin capabilities

- View pending subscription changes, payment attempts, wallet top-ups,
  enterprise inquiries and subscriptions requiring attention.
- Manually override a workspace plan, revenue model, term, status and dates.
- Optionally cancel pending plan requests and open renewal quotes during an
  override.
- Credit or debit prepaid wallet balances with a required reason.
- Freeze, reactivate or close wallets.
- Change a zero-balance wallet currency.
- Configure low-balance warning thresholds.
- Review all actions in the existing audit trail.

## Safety

- Platform-admin authentication is required.
- Wallet balances cannot be reduced below reserved funds.
- Wallet currency cannot change while money is present.
- Wallets with reserved funds cannot be closed.
- Enterprise overrides require an explicit commitment end date.
- Manual subscription overrides preserve wallet top-up invoices and only void
  pending plan-change or renewal invoices when requested.

No database migration is required.
