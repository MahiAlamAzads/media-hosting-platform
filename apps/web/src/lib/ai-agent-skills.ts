export type AiAgentSkill = {
  id: string;
  title: string;
  description: string;
  filename: string;
  content: string;
};

const sharedRules = `## Non-negotiable rules

- Keep MEDIA_PLATFORM_API_KEY on a trusted server only.
- Never place the API key in browser JavaScript, mobile bundles, NEXT_PUBLIC_ variables, logs or source control.
- Send visibility explicitly as PUBLIC or PRIVATE.
- Use the upload session's returned chunkSizeBytes; never hardcode chunk size.
- Upload raw chunk bytes with Content-Type: application/octet-stream.
- Abort the upload session after a failed upload so reserved quota is released.
- Save assetId as the permanent identifier.
- PUBLIC image: use imgUrl returned by the complete response.
- PUBLIC non-image file: use fileUrl.
- PRIVATE media: imgUrl and fileUrl are null; create a short-lived signed URL from the trusted server when an authorized user requests the asset.
- Never store signed delivery URLs permanently.
- Log requestId from success and error responses.
- Handle 401, 403, 409, 410, 413 and 429 explicitly.
- Do not call administrator, billing-administration or internal platform endpoints.`;

export const aiAgentSkills: AiAgentSkill[] = [
  {
    id: "universal",
    title: "Universal integration skill",
    description:
      "Use with any coding agent before asking it to integrate uploads and delivery.",
    filename: "MEDIA_PLATFORM_SKILL.md",
    content: `---
name: media-platform-integration
description: Integrate the Media Platform customer API for secure PUBLIC and PRIVATE uploads, permanent CDN image URLs and temporary private delivery URLs.
---

# Media Platform Integration Skill

You are integrating a customer application with Media Platform. Build a production-safe, server-side integration using the application's existing architecture and coding conventions.

${sharedRules}

## Environment

Use server-only environment variables:

\`\`\`env
MEDIA_PLATFORM_API_URL=https://api.alamahi.cloud
MEDIA_PLATFORM_API_KEY=mh_live_key_id.secret
\`\`\`

## Required scopes

- uploads:write — create, send, complete and abort uploads
- media:read — read media and create private signed delivery URLs
- media:write — optional; only for rename, move or visibility changes

## Upload contract

1. POST /api/v1/uploads with filename, contentType, sizeBytes and visibility.
2. Read data.uploadId, data.assetId, data.chunkSizeBytes and data.expectedChunks.
3. Split the file using data.chunkSizeBytes.
4. PUT every raw chunk to /api/v1/uploads/{uploadId}/chunks/{chunkIndex}.
5. POST /api/v1/uploads/{uploadId}/complete with an empty JSON object.
6. Return assetId, visibility, imgUrl, fileUrl, thumbnailUrl, previewUrl and optimization status to the application.
7. Image uploads are optimized automatically after completion. Keep assetId as the stable identifier and re-read the asset when the optimized preview URL is needed immediately.
8. If any step fails after initialization, DELETE /api/v1/uploads/{uploadId}.

## Visibility

PUBLIC is for product photos, avatars, blog images and public website media. The completed public image response includes a permanent imgUrl.

PRIVATE is for protected user files, invoices and internal media. The completed response has imgUrl: null and fileUrl: null. Create a signed URL using POST /api/v1/media/{assetId}/delivery-token only after the application's own authorization check.

## Required implementation output

- A reusable MediaPlatformClient module
- A server-side upload handler that accepts file and visibility
- PUBLIC and PRIVATE examples
- Validation for missing/empty files and invalid visibility
- Structured error mapping that preserves API error code, message and requestId
- Cleanup/abort behavior
- A brief setup section listing environment variables and API-key scopes
- Tests or focused test cases for PUBLIC upload, PRIVATE upload, upload failure cleanup and signed private delivery

Before writing code, inspect the repository and use its package manager, framework conventions, validation library and error style. Do not invent undocumented endpoints or response fields.`,
  },
  {
    id: "nextjs",
    title: "Next.js App Router skill",
    description:
      "Creates a server-only Route Handler and reusable typed client.",
    filename: "MEDIA_PLATFORM_NEXTJS_SKILL.md",
    content: `---
name: media-platform-nextjs
description: Add a secure Media Platform integration to a Next.js App Router application.
---

# Next.js Media Platform Skill

Implement Media Platform in this Next.js App Router project.

${sharedRules}

## Architecture requirements

- Use export const runtime = "nodejs" for upload handlers.
- Store the API key only in MEDIA_PLATFORM_API_KEY, never NEXT_PUBLIC_MEDIA_PLATFORM_API_KEY.
- Put the reusable client in src/lib/media-platform-client.ts unless the repository has a better established location.
- Put the upload endpoint in app/api/media/upload/route.ts unless the existing route organization requires another location.
- Accept multipart FormData with file and visibility.
- Normalize visibility: only the exact value PRIVATE selects private; otherwise use PUBLIC after validating the allowed values.
- Avoid buffering very large files in memory when the project supports streaming or temporary-file storage.
- Clean temporary files in finally.
- Return assetId, visibility, imgUrl, fileUrl and deliveryUrl.
- For PRIVATE media, create deliveryUrl only after checking the signed-in application's authorization.

## API flow

POST /api/v1/uploads -> PUT chunks -> POST complete. Use the returned chunkSizeBytes. DELETE the upload session on failure.

## Deliverables

1. Typed MediaPlatformClient with uploadFile and createDeliveryUrl.
2. Next.js Route Handler.
3. Minimal browser form example that sends file and PUBLIC/PRIVATE, but never receives the API key.
4. Error response mapping with status, code, message and requestId.
5. Tests for PUBLIC and PRIVATE behavior.
6. Setup notes for MEDIA_PLATFORM_API_URL, MEDIA_PLATFORM_API_KEY and scopes uploads:write media:read.

Inspect the current repository before editing. Preserve its TypeScript strictness, linting and error conventions.`,
  },
  {
    id: "node",
    title: "Node, Express or Fastify skill",
    description:
      "Builds a reusable Node client plus a multipart server endpoint.",
    filename: "MEDIA_PLATFORM_NODE_SKILL.md",
    content: `---
name: media-platform-node
description: Integrate Media Platform into Node.js, Express or Fastify using a server-side multipart endpoint.
---

# Node.js Media Platform Skill

Integrate Media Platform into this Node.js service.

${sharedRules}

## Framework rules

- Detect whether the project uses plain Node.js, Express or Fastify and follow its established router/plugin style.
- Keep the API key in process.env.MEDIA_PLATFORM_API_KEY.
- Use process.env.MEDIA_PLATFORM_API_URL for the base URL.
- Use the existing multipart library. For Express, prefer the project's Multer convention. For Fastify, prefer @fastify/multipart when already installed.
- Stream incoming files to a controlled temporary location when practical.
- Enforce configured file-size and MIME allowlists before uploading.
- Delete temporary files in finally.
- Validate visibility as PUBLIC or PRIVATE.
- Use chunkSizeBytes returned by the upload initialization response.
- Abort the remote upload after partial failure.

## Result contract

Return:

\`\`\`json
{
  "assetId": "...",
  "visibility": "PUBLIC",
  "imgUrl": "https://cdn.example/i/...",
  "fileUrl": "https://cdn.example/i/...",
  "deliveryUrl": null
}
\`\`\`

For PRIVATE media, imgUrl and fileUrl remain null; deliveryUrl is created server-side only after application authorization.

## Deliverables

- Reusable client module
- Multipart upload route/plugin
- PUBLIC and PRIVATE request examples
- Central API error class preserving status/code/requestId
- Cleanup and abort logic
- Focused tests
- Environment and API-scope documentation

Do not add browser-side API-key usage or internal/admin endpoint calls.`,
  },
  {
    id: "php",
    title: "PHP skill",
    description:
      "Creates a cURL client and safe upload controller/service for PHP projects.",
    filename: "MEDIA_PLATFORM_PHP_SKILL.md",
    content: `---
name: media-platform-php
description: Integrate Media Platform into a PHP application using cURL and server-side file handling.
---

# PHP Media Platform Skill

Implement a production-safe PHP integration for Media Platform.

${sharedRules}

## PHP requirements

- Use getenv('MEDIA_PLATFORM_API_URL') and getenv('MEDIA_PLATFORM_API_KEY').
- Never render the API key into HTML or JavaScript.
- Create a MediaPlatformClient class with typed method signatures where the project's PHP version supports them.
- Use cURL with explicit timeouts, JSON decoding checks and HTTP status handling.
- Validate upload errors, file size, MIME type and visibility before calling the platform.
- Use fopen/fread or equivalent chunked file reading based on chunkSizeBytes returned by the API.
- Upload chunk bodies as application/octet-stream.
- Abort the upload session on failure.
- Return assetId and permanent imgUrl for PUBLIC images.
- For PRIVATE media, return no permanent URL; create a signed URL only after the application's authorization check.

## Deliverables

1. MediaPlatformClient.php
2. Framework-appropriate controller/service example or a plain PHP upload handler
3. PUBLIC/PRIVATE form handling
4. MediaPlatformException containing HTTP status, API code and requestId
5. Cleanup and abort logic
6. Setup notes and test examples

Use the repository's existing autoloading, namespaces, framework response helpers and validation style.`,
  },
];
