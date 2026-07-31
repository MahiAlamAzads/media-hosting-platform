# Phase 6 usage summary build fix

Fixes the Prisma 7 `groupBy` compile error by using explicit aggregate queries for:

- IMAGE
- VIDEO
- AUDIO
- DOCUMENT
- OTHER

No migration is required. Existing `.env`, database, migrations and media storage are preserved.
