# Phase 5 — Media lifecycle, folders, usage and audit

Adds:

## Media

- Single media details
- Filename rename
- Move media between folders
- Visibility update
- Search by filename
- Permanent deletion
- Bulk move
- Bulk trash
- Bulk restore
- Storage usage decrement after permanent deletion
- Audit logs for lifecycle actions

## Folders

- Single folder details
- Rename folder
- Move folder
- Descendant path and depth updates
- Cycle prevention
- Folder lifecycle audit logs

## Usage

- Storage limit, used, reserved and available bytes
- Media counts by type
- Ready/deleted asset counts
- Active upload count
- Folder count

## Audit

- Cursor-paginated workspace audit-log endpoint
- Filter by action and entity type

## New routes

```text
GET    /api/v1/media/:assetId
PATCH  /api/v1/media/:assetId
DELETE /api/v1/media/:assetId/permanent
POST   /api/v1/media/bulk

GET    /api/v1/folders/:folderId
PATCH  /api/v1/folders/:folderId

GET    /api/v1/usage/summary
GET    /api/v1/audit-logs
```

No database migration is required because the existing schema already contains the required folder, media, workspace and audit fields.
