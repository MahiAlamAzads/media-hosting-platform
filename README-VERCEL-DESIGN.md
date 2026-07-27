# Vercel design branch frontend

Target branch: `vercel-design`

This patch replaces the entire `apps/web/src` tree with a restrained Geist and Vercel Brand Guidelines frontend while preserving the current backend contracts.

Implemented routes:

- Public landing page
- Sign in, registration, verification, password reset and email confirmation
- Overview
- Media list and media detail
- Folders and nested folder detail
- Chunked upload
- Usage
- Audit logs
- Account
- Security sessions
- API keys
- API documentation

The implementation:

- Uses Geist and Geist Mono through `next/font/google`
- Loads the official Vercel Brand Guidelines CSS foundation
- Supports light and dark through system preference
- Removes Bootstrap and icon-kit dependencies
- Uses real API responses instead of mock dashboard data
- Preserves current backend, PostgreSQL, migrations, `.env` and storage
