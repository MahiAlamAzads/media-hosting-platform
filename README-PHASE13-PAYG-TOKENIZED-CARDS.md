# Phase 13 — Pay As You Go Billing & Saved Payment Methods

Phase 13 lets a workspace continue selected metered services after the
included plan limit is reached.

## Security boundary

Media Platform never receives or stores a raw card number or CVV. The user
enters card details on a hosted payment-provider page. The platform stores
only:

- provider customer token;
- provider payment-method token;
- brand and last four digits;
- expiry month/year for display and expiry handling;
- billing name/email when supplied by the provider;
- explicit off-session consent version and timestamp.

## Supported provider behavior

- Stripe Setup Checkout and SetupIntent are implemented for tokenized
  off-session card setup and automatic PaymentIntent charging.
- SSLCOMMERZ one-time hosted checkout and manual payments remain unchanged.
- SSLCOMMERZ card-on-file PAYG remains feature-gated until the merchant has
  recurring-token API approval and matching private API documentation.

## PAYG policy

Workspace owners/admins can:

- enable or disable PAYG;
- select individual priced meters;
- choose a default saved card;
- set a monthly PAYG spend cap;
- optionally set a per-meter spend cap;
- set an automatic charge threshold;
- remove or replace a saved payment method.

At 100% of an included limit:

- a selected PAYG meter continues while the policy, card and spend caps are
  valid;
- an unselected meter remains hard-stopped;
- a failed or action-required charge pauses PAYG and re-enables hard stops.

## Database migration

`20260727230000_phase13_payg_tokenized_cards`

## Environment

```env
PAYG_ENABLED=true
PAYG_CARD_PROVIDER=STRIPE
PAYG_DEFAULT_MONTHLY_CAP_BDT_MINOR=500000
PAYG_DEFAULT_MONTHLY_CAP_USD_MINOR=5000
PAYG_DEFAULT_CHARGE_THRESHOLD_BDT_MINOR=50000
PAYG_DEFAULT_CHARGE_THRESHOLD_USD_MINOR=500
PAYG_AUTHORIZATION_TTL_MINUTES=30
PAYG_PROCESSING_AUTHORIZATION_MILLISECONDS=60000

STRIPE_PAYG_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

`STRIPE_PAYG_ENABLED` should remain `false` until hosted setup and webhook
credentials are configured.

## Stripe webhook

Configure the provider webhook endpoint as:

```text
https://api.alamahi.cloud/api/v1/payment-callbacks/stripe
```

Required event types:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

For local testing, use a provider webhook forwarding tool or a public tunnel.

## Operations

Run automatic PAYG collection every 15 minutes:

```bash
pnpm payg:charge
```

The job also releases expired usage authorizations. It charges pending ledger
entries after the workspace threshold is reached or near period end.

## Pages

```text
/dashboard/billing/pay-as-you-go
/dashboard/billing/usage
```

Failed or action-required automatic charges appear in:

```text
http://localhost:3002/operations
```
