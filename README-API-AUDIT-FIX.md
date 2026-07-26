# Test fix and API audit

Fixes:

- Loads the project root `.env` before test modules import runtime configuration.
- Adds safe test-only fallback values.
- Removes unsupported Vitest matcher generics.
- Adds important API contract smoke tests.
- Adds a clear implemented/missing API audit.

Run:

```bash
pnpm install
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
```

Review:

```text
API_IMPLEMENTATION_AUDIT.md
```
