# Phase 16 — Developer-First API Documentation

This phase rewrites the public and dashboard API documentation around the
shortest successful developer journey:

1. Choose PUBLIC or PRIVATE.
2. Create a least-privilege API key.
3. Start the resumable upload.
4. Send server-sized chunks.
5. Complete the upload.
6. Save `assetId` and use `imgUrl` for public images.
7. Create temporary signed URLs for private media.

Updated frameworks:

- Next.js
- Node.js
- Express
- Fastify
- PHP

The downloadable examples now accept a visibility value and return either a
permanent public URL or a temporary private signed URL.

No backend endpoint, database schema, billing logic, media file or API key
behavior is changed.
