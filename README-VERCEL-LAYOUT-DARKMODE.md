# Vercel design layout organization and dark mode

Target branch: `vercel-design`

Adds:

- Persistent light/dark mode stored in localStorage
- System preference on the first visit
- Pre-hydration theme script to avoid a light flash
- Theme controls on dashboard, authentication, landing and API docs
- Better sidebar grouping and footer status
- Mobile close button, backdrop, Escape handling and body scroll lock
- Better topbar alignment
- More consistent page, section, form, table and list geometry
- Dark-mode surfaces, borders, controls, tables and public documentation
- Existing reduced-motion behavior remains enabled

No backend, database, migration, `.env` or media-storage file is changed.
