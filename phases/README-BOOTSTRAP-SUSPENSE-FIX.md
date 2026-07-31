# Bootstrap frontend Next.js build fix

Fixes:

- Wraps every `useSearchParams()` token page in a React Suspense boundary.
- Splits each route into a server page wrapper and client interaction component.
- Covers:
  - `/auth/confirm-email`
  - `/auth/verify-email`
  - `/auth/reset-password`
- Sets `turbopack.root` to the current monorepo root to silence the incorrect workspace-root warning.

No backend, database, migration, environment or storage files are changed.
