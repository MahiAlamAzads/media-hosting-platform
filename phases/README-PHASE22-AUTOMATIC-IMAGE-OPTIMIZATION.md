# Phase 22 — Automatic Image Optimization and Transformation

Image uploads are now processed automatically after upload completion.

## Behavior

- Original files remain unchanged and downloadable through `fileUrl`.
- Automatic `THUMBNAIL` and `PREVIEW` variants are generated.
- Default output is WebP; AVIF can be selected through `.env`.
- EXIF orientation is normalized.
- Metadata is stripped by default through Sharp's encoded output pipeline.
- Images are never enlarged.
- Public `imgUrl` automatically points to the optimized preview when ready.
- Redis-backed throttling reduces duplicate processing across API instances.
- A periodic database sweep recovers jobs after process restarts.
- Manual regeneration remains available through the variants endpoint.
- Storage, transformation and CPU usage continue through existing quota/PAYG accounting.

No database migration is required.
