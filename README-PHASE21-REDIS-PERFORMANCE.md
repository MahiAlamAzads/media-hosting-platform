# Phase 21 — Redis Performance and Cache Optimization

This phase adds a shared Redis performance layer using one connection URL.

## Improvements

- Redis-backed API rate limits for multi-process and multi-server deployments.
- Cached public-media descriptors for `/i/:assetId`.
- Cached public pricing responses.
- Single-flight cache loading to reduce cache stampedes.
- Authentication `lastUsedAt` database writes throttled to once per configured interval.
- Usage-alert evaluation bursts deduplicated across API instances.
- Redis health and cache statistics in the platform Admin Operations page.
- Graceful startup and shutdown.
- Safe local bounded fallbacks when Redis is optional and temporarily unavailable.
- Explicit cache invalidation after media visibility, trash, restore, delete, upload-complete and image-variant changes.

## Safety

Redis is never used as the source of truth for:

- sessions or revocation decisions;
- API-key authorization;
- plan entitlements;
- wallet balances;
- PAYG charging;
- subscriptions;
- invoices;
- usage accounting.

PostgreSQL remains authoritative. Redis only removes repeated reads, repeated touch writes and process-local rate-limit state.

## Connection

Both non-TLS and TLS URLs are supported by the official client:

```env
REDIS_URL=redis://default:password@host:6379/0
```

```env
REDIS_URL=rediss://default:password@host:6379/0
```

Do not place the Redis URL in any `NEXT_PUBLIC_` variable.

## Required mode

Development-safe default:

```env
REDIS_REQUIRED=false
```

Strict production readiness:

```env
REDIS_REQUIRED=true
```

When strict mode is enabled, the HTTP process remains available for health checks, while `/health/ready` returns 503 until Redis becomes ready.

## Health

```text
GET /health/redis
GET /health/ready
```

The public health response exposes only configured/required/status/readiness. Redis errors and cache counters remain restricted to the platform Admin Operations page. The Redis URL and password are never returned.

## Validation

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```
