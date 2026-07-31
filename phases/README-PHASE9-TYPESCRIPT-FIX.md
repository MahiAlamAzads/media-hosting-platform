# Phase 9 TypeScript Build Fix

This targeted patch fixes the two strict TypeScript errors reported after
Phase 9 payment implementation.

## Fixes

1. Normalizes the optional SSLCOMMERZ callback status to an uppercase string
   before validating or passing it to the failure handler.
2. Explicitly guards the whole-number regex capture before converting a
   decimal gateway amount to `BigInt`.

No database, migration, pricing, subscription, payment, callback, manual
payment, storage or frontend behavior is changed.

## Modified files

- `apps/api/src/modules/payments/payment-callback.route.ts`
- `apps/api/src/modules/payments/payment.utils.ts`

## Validate

```bash
pnpm typecheck
pnpm test
pnpm build
```
