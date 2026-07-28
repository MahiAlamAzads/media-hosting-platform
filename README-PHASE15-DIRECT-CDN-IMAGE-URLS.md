# Phase 15 — Direct CDN Image URLs

Phase 15 gives developers a stable, absolute URL immediately after a public
image upload completes.

Example completion payload:

```json
{
  "data": {
    "assetId": "cm...",
    "visibility": "PUBLIC",
    "imgUrl": "https://cdn.alamahi.cloud/i/cm...",
    "fileUrl": "https://cdn.alamahi.cloud/i/cm...",
    "thumbnailUrl": null,
    "previewUrl": null
  }
}
```

Use it directly:

```html
<img src="https://cdn.alamahi.cloud/i/cm..." alt="" />
```

## Upload visibility

The upload-init request accepts:

```json
{
  "visibility": "PUBLIC"
}
```

Omitted visibility remains `PRIVATE` for backward-compatible security.
The workspace upload page enables public CDN delivery by default and lets the
user turn it off.

## URL fields

Upload completion, media listing, media details and visibility updates expose:

- `fileUrl`: stable public URL for any READY PUBLIC asset;
- `imgUrl`: same URL only when the asset is an image;
- `thumbnailUrl`: available when the THUMBNAIL variant is READY;
- `previewUrl`: available when the PREVIEW variant is READY;
- `cdnPath`: relative `/i/<assetId>` path;
- `isPublic`: whether the URL is currently deliverable.

Private assets return `null` URL fields and continue to use signed delivery
URLs.

## CDN origin

Local:

```env
CDN_PUBLIC_URL=http://localhost:4000
NEXT_PUBLIC_CDN_URL=http://localhost:4000
```

Production:

```env
CDN_PUBLIC_URL=https://cdn.alamahi.cloud
NEXT_PUBLIC_CDN_URL=https://cdn.alamahi.cloud
```

The CDN domain must reverse-proxy `/i/*` to the Express API service.
When `CDN_PUBLIC_URL` is omitted, API responses fall back to `API_PUBLIC_URL`.

## Delivery behavior

- New short route: `GET /i/:assetId`
- Legacy route remains supported: `GET /api/v1/public/media/:assetId`
- Cross-origin image delivery is enabled.
- `Cross-Origin-Resource-Policy: cross-origin` is returned.
- Public image requests use a separate 3,000 requests/minute per-IP limiter.
- Plan bandwidth, prepaid PAYG and hard-stop enforcement still apply.
- ETag/304 responses avoid charging delivery bytes when content is not resent.

## No migration

Phase 15 has no Prisma migration and does not modify PostgreSQL data or media
files.
