# API implementation audit

This audit is based on the current Phase 1–3 source structure.

## Implemented and route-wired

### Health

- `GET /health/live`
- `GET /health/ready`
- `GET /health/storage`

### Authentication

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

### Uploads

- `POST /api/v1/uploads`
- `GET /api/v1/uploads/:uploadId`
- `PUT /api/v1/uploads/:uploadId/chunks/:chunkIndex`
- `POST /api/v1/uploads/:uploadId/complete`
- `DELETE /api/v1/uploads/:uploadId`

### Media

- `GET /api/v1/media`
- `POST /api/v1/media/:assetId/delivery-token`
- `PATCH /api/v1/media/:assetId/visibility`
- `DELETE /api/v1/media/:assetId`
- `POST /api/v1/media/:assetId/restore`

### Folders

- `GET /api/v1/folders`
- `POST /api/v1/folders`
- `DELETE /api/v1/folders/:folderId`

### Delivery

- `GET /api/v1/delivery/:token`

## Important APIs not yet implemented

These were part of the wider platform plan but are not implemented in the current Phase 1–3 source:

### Authentication gaps

- Resend email verification
- Logout all devices
- List active sessions
- Revoke a selected session
- Change password
- Profile update
- Workspace switching

### Folder gaps

- Rename folder
- Move folder
- Nested-folder navigation endpoint
- Recursive folder deletion
- Move media between folders

### Media gaps

- Read single media metadata
- Rename media
- Permanent delete
- Bulk actions
- Public unauthenticated delivery for `PUBLIC` assets
- Image thumbnails
- Video metadata and FFprobe
- HLS transcoding
- Nginx accelerated delivery

### Platform/API gaps

- API secret keys
- API-key scopes
- Webhooks
- Usage metering
- Bandwidth accounting
- Admin panel
- Plans/subscriptions
- Audit-log endpoints
- Security-event endpoints

## Current verification level

The automated suite checks:

- Route presence
- Request validation
- Protected-route authentication rejection
- Invalid delivery-token rejection
- HTTP Range parsing
- Delivery service authorization behavior
- Storage path traversal protection
- Common MIME signature detection
- Health and structured 404 responses

The suite does not claim successful database-backed end-to-end behavior for registration, login, upload completion, trash/restore, or folder persistence. Those require isolated test database fixtures and SMTP/storage test doubles.
