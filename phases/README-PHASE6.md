# Phase 6 — Image variants and public delivery

Adds:

- Image width and height metadata
- Thumbnail variant: max 320×320 WebP
- Preview variant: max 1280×1280 WebP
- Variant database records and processing state
- Public delivery for assets marked `PUBLIC`
- Long-cache immutable public variants
- Manual processing endpoint
- Batch media-processing command
- Sharp build approval
- Phase 6 API contract tests

## New routes

```text
GET  /api/v1/public/media/:assetId
GET  /api/v1/public/media/:assetId?variant=THUMBNAIL
GET  /api/v1/public/media/:assetId?variant=PREVIEW

GET  /api/v1/variants/media/:assetId
POST /api/v1/variants/media/:assetId/process
```

## Process pending images

```bash
pnpm process:media
```

Recommended cron for an initial single-server deployment:

```cron
*/2 * * * * cd /path/to/media-hosting-platform && /usr/bin/pnpm process:media
```

This phase processes images only. Video metadata, FFmpeg, HLS, audio waveform and document preview remain future phases.
