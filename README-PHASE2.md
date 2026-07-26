# Phase 2 — Local Media Upload and Library

Adds:

- Workspace-scoped chunked uploads
- Resume status endpoint
- Duplicate chunk idempotency
- SHA-256 checksum verification
- Storage quota reservation
- Local SSD/HDD file assembly
- Folder creation and empty-folder deletion
- Cursor-based media listing
- Trash and restore API
- Responsive Cloudinary-inspired media library
- Browser-side upload progress

## Current limits

- Phase 2 does not stream media publicly.
- Phase 2 does not run FFmpeg or malware scanning.
- Files are assembled locally; large-file checksum currently reads the final file in memory. Phase 3 must replace this with streaming hashing before very large production uploads.
- Access tokens are stored in `sessionStorage` for this baseline dashboard. A stronger in-memory/BFF session architecture should replace this before public production launch.

## Apply and verify

```bash
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm db:check
pnpm typecheck
pnpm build
```
