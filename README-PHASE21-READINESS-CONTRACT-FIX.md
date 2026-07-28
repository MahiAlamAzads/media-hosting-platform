# Phase 21 Readiness Contract Fix

This targeted patch restores the existing public readiness response contract.

Successful readiness:

```json
{
  "status": "ready"
}
```

Failed readiness when Redis is required but unavailable:

```json
{
  "status": "not_ready"
}
```

HTTP behavior remains:

- `200` when the service is ready
- `503` when `REDIS_REQUIRED=true` and Redis is unavailable

Redis diagnostics remain available from:

```text
GET /health/redis
```

This avoids breaking strict clients and the existing API tests while keeping
Redis readiness enforcement intact.

No database migration, cache behavior, billing behavior, media delivery, rate
limiting, or Redis connection setting is changed.
