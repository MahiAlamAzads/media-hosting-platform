# Media Hosting Platform — Phase 1

Secure self-hosted SaaS foundation using Next.js, Express, TypeScript, PostgreSQL, Prisma, JWT and Nodemailer.

## Requirements

- Node.js 24+
- pnpm
- PostgreSQL 16+
- A dedicated writable SSD/HDD mount for `MEDIA_STORAGE_ROOT`

## Start

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Dashboard: http://localhost:3000  
API: http://localhost:4000

## Security notes

- Never expose `MEDIA_STORAGE_ROOT` as a public static directory.
- Put PostgreSQL and media backups on different physical disks.
- Replace every secret before deployment.
- Use HTTPS and set `COOKIE_SECURE=true` in production.
