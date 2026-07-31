# Phase 12 — Usage Threshold Warning and Hard Stop

This phase implements the exact warning policy requested:

- 70%: early dashboard and email warning
- 80%: elevated dashboard and email warning
- 90%: critical dashboard and email warning
- 100%: persistent dashboard warning, email notification and hard stop for
  entitlements configured with `hardLimit=true` and `overageAllowed=false`

Dashboard warnings are calculated from live usage and appear throughout the
workspace console. Email alerts are deduplicated by workspace, metric,
threshold and billing period. Failed emails are retained and retried.

The existing command remains:

```bash
pnpm usage:send-alerts
```

Recommended production schedule:

```cron
*/5 * * * * cd /path/to/media-hosting-platform && pnpm usage:send-alerts
```

A new page is available at:

```text
/dashboard/billing/alerts
```

The migration only adds usage-alert email delivery state. It does not alter
prices, subscriptions, media files, invoices or payments.
