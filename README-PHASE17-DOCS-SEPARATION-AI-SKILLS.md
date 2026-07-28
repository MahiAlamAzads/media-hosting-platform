# Phase 17 — Admin/Internal Docs Separation and AI Agent Skills

This phase corrects documentation visibility:

- The complete OpenAPI schema is protected by signed-in platform-admin middleware.
- Internal endpoint inventory is rendered only in the separate Admin Console.
- Customer users see only integration-safe documentation inside the workspace dashboard.
- Public `/docs` routes redirect to the signed-in dashboard developer center.
- Customer docs no longer link to or advertise the full internal OpenAPI schema.
- Copy-paste AI agent skills are included for universal, Next.js, Node/Express/Fastify and PHP integrations.

No database migration is required. No media, billing or API operation behavior changes.
