# Phase 3 — Secure local delivery

Adds:

- Short-lived signed delivery tokens
- Private inline/download delivery
- HTTP Range support for video/audio seeking
- MIME magic-byte inspection for common media types
- Streaming SHA-256 calculation
- Private/public visibility metadata
- Expired upload cleanup command
- Cumulative Phase 2 TypeScript fixes

## Important

Express streaming is suitable for initial single-server operation. For high concurrency, Phase 4 should move byte delivery behind Nginx `X-Accel-Redirect` while Express keeps authorization and token issuance.

Run cleanup periodically:

```bash
pnpm cleanup:uploads
```

Example cron:

```cron
*/15 * * * * cd /path/to/media-hosting-platform && /usr/bin/pnpm cleanup:uploads
```
