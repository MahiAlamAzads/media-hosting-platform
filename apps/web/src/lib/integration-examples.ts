export type IntegrationExample = {
  id: "nextjs" | "nodejs" | "express" | "fastify" | "php";
  label: string;
  description: string;
  install: string;
  filename: string;
  downloadHref: string;
  code: string;
};

export const integrationExamples: IntegrationExample[] = [
  {
    id: "nextjs",
    label: "Next.js",
    description:
      "A secure App Router Route Handler. The API key stays on the server, while the caller chooses PUBLIC or PRIVATE visibility.",
    install:
      "Copy media-platform-client.ts into src/lib, then add this Route Handler.",
    filename: "app/api/media/upload/route.ts",
    downloadHref: "/examples/nextjs-upload-route.ts",
    code: `import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { MediaPlatformClient } from "@/lib/media-platform-client";

export const runtime = "nodejs";

const client = new MediaPlatformClient({
  baseUrl: process.env.MEDIA_PLATFORM_API_URL!,
  apiKey: process.env.MEDIA_PLATFORM_API_KEY!
});

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const visibility =
    form.get("visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC";

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 }
    );
  }

  const tempPath = join(
    tmpdir(),
    \`\${randomUUID()}-\${file.name}\`
  );

  try {
    await writeFile(
      tempPath,
      Buffer.from(await file.arrayBuffer())
    );

    const uploaded = await client.uploadFile(tempPath, {
      contentType:
        file.type || "application/octet-stream",
      visibility
    });

    const deliveryUrl =
      visibility === "PRIVATE"
        ? await client.createDeliveryUrl(uploaded.assetId)
        : null;

    return NextResponse.json({
      assetId: uploaded.assetId,
      visibility,
      imgUrl: uploaded.imgUrl,
      fileUrl: uploaded.fileUrl,
      deliveryUrl
    });
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}`,
  },
  {
    id: "nodejs",
    label: "Node.js",
    description:
      "A dependency-free Node.js script. Pass PUBLIC or PRIVATE as the third command-line argument.",
    install: "Node.js 20 or newer; no runtime dependency required.",
    filename: "node-upload.mjs",
    downloadHref: "/examples/node-upload.mjs",
    code: `import { MediaPlatformClient } from "./media-platform-client.mjs";

const [
  filePath,
  contentType = "application/octet-stream",
  visibilityInput = "PUBLIC"
] = process.argv.slice(2);

if (!filePath) {
  console.error(
    "Usage: node node-upload.mjs ./photo.jpg image/jpeg PUBLIC"
  );
  process.exit(1);
}

const visibility =
  visibilityInput.toUpperCase() === "PRIVATE"
    ? "PRIVATE"
    : "PUBLIC";

const client = new MediaPlatformClient({
  baseUrl:
    process.env.MEDIA_PLATFORM_API_URL ??
    "http://localhost:4000",
  apiKey: process.env.MEDIA_PLATFORM_API_KEY
});

const uploaded = await client.uploadFile(filePath, {
  contentType,
  visibility
});

console.log({
  assetId: uploaded.assetId,
  visibility,
  imgUrl: uploaded.imgUrl,
  fileUrl: uploaded.fileUrl,
  deliveryUrl:
    visibility === "PRIVATE"
      ? await client.createDeliveryUrl(uploaded.assetId)
      : null
});`,
  },
  {
    id: "express",
    label: "Express",
    description:
      "An Express multipart endpoint. Send a file field and an optional visibility field.",
    install: "npm install express multer",
    filename: "routes/media.mjs",
    downloadHref: "/examples/express-media-route.mjs",
    code: `import { unlink } from "node:fs/promises";
import express from "express";
import multer from "multer";
import { MediaPlatformClient } from "./media-platform-client.mjs";

const router = express.Router();
const upload = multer({ dest: ".tmp/uploads/" });

const client = new MediaPlatformClient({
  baseUrl: process.env.MEDIA_PLATFORM_API_URL,
  apiKey: process.env.MEDIA_PLATFORM_API_KEY
});

router.post(
  "/media",
  upload.single("file"),
  async (req, res, next) => {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }

    const visibility =
      req.body.visibility === "PRIVATE"
        ? "PRIVATE"
        : "PUBLIC";

    try {
      const uploaded = await client.uploadFile(
        req.file.path,
        {
          contentType: req.file.mimetype,
          visibility
        }
      );

      res.status(201).json({
        assetId: uploaded.assetId,
        filename: req.file.originalname,
        visibility,
        imgUrl: uploaded.imgUrl,
        fileUrl: uploaded.fileUrl,
        deliveryUrl:
          visibility === "PRIVATE"
            ? await client.createDeliveryUrl(
                uploaded.assetId
              )
            : null
      });
    } catch (error) {
      next(error);
    } finally {
      await unlink(req.file.path).catch(
        () => undefined
      );
    }
  }
);

export default router;`,
  },
  {
    id: "fastify",
    label: "Fastify",
    description:
      "A Fastify multipart route. Use ?visibility=PUBLIC or ?visibility=PRIVATE for a predictable server-side choice.",
    install: "npm install fastify @fastify/multipart",
    filename: "routes/media.mjs",
    downloadHref: "/examples/fastify-media-route.mjs",
    code: `import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import multipart from "@fastify/multipart";
import { MediaPlatformClient } from "./media-platform-client.mjs";

export default async function mediaRoutes(fastify) {
  await fastify.register(multipart);

  const client = new MediaPlatformClient({
    baseUrl: process.env.MEDIA_PLATFORM_API_URL,
    apiKey: process.env.MEDIA_PLATFORM_API_KEY
  });

  fastify.post("/media", async (request, reply) => {
    const part = await request.file();

    if (!part) {
      return reply.code(400).send({
        error: "file is required"
      });
    }

    const visibility =
      String(
        request.query?.visibility ?? "PUBLIC"
      ).toUpperCase() === "PRIVATE"
        ? "PRIVATE"
        : "PUBLIC";

    const tempPath = join(
      tmpdir(),
      \`\${randomUUID()}-\${part.filename}\`
    );

    try {
      await pipeline(
        part.file,
        createWriteStream(tempPath)
      );

      const uploaded = await client.uploadFile(
        tempPath,
        {
          contentType: part.mimetype,
          visibility
        }
      );

      return reply.code(201).send({
        assetId: uploaded.assetId,
        filename: part.filename,
        visibility,
        imgUrl: uploaded.imgUrl,
        fileUrl: uploaded.fileUrl,
        deliveryUrl:
          visibility === "PRIVATE"
            ? await client.createDeliveryUrl(
                uploaded.assetId
              )
            : null
      });
    } finally {
      await unlink(tempPath).catch(
        () => undefined
      );
    }
  });
}`,
  },
  {
    id: "php",
    label: "PHP",
    description:
      "A dependency-free PHP cURL client. Pass PUBLIC or PRIVATE as the third CLI argument.",
    install: "PHP 8.1+ with the cURL extension enabled.",
    filename: "php-upload.php",
    downloadHref: "/examples/php-upload.php",
    code: `<?php

declare(strict_types=1);

require __DIR__ . '/MediaPlatformClient.php';

$client = new MediaPlatformClient(
    getenv('MEDIA_PLATFORM_API_URL')
        ?: 'http://localhost:4000',
    getenv('MEDIA_PLATFORM_API_KEY')
        ?: throw new RuntimeException(
            'MEDIA_PLATFORM_API_KEY is required'
        )
);

$filePath = $argv[1]
    ?? throw new RuntimeException(
        'Usage: php php-upload.php ./photo.jpg image/jpeg PUBLIC'
    );

$contentType =
    $argv[2] ?? 'application/octet-stream';

$visibility =
    strtoupper($argv[3] ?? 'PUBLIC') === 'PRIVATE'
        ? 'PRIVATE'
        : 'PUBLIC';

$uploaded = $client->uploadFile(
    $filePath,
    $contentType,
    null,
    $visibility
);

print_r([
    'assetId' => $uploaded['assetId'],
    'visibility' => $visibility,
    'imgUrl' => $uploaded['imgUrl'] ?? null,
    'fileUrl' => $uploaded['fileUrl'] ?? null,
    'deliveryUrl' =>
        $visibility === 'PRIVATE'
            ? $client->createDeliveryUrl(
                $uploaded['assetId']
            )
            : null,
]);`,
  },
];

export const apiKeyScopes = [
  [
    "uploads:write",
    "Create upload sessions, send chunks, complete uploads and abort failed uploads.",
  ],
  [
    "media:read",
    "List media, read metadata and create temporary signed delivery URLs.",
  ],
  ["media:write", "Rename, move and switch assets between PUBLIC and PRIVATE."],
  ["media:delete", "Trash, restore and permanently delete media."],
  ["folders:read", "Read the workspace folder tree."],
  ["folders:write", "Create, rename, move and delete folders."],
  ["usage:read", "Read usage, quota and billing-meter summaries."],
] as const;

export const coreEndpoints = [
  [
    "POST",
    "/api/v1/uploads",
    "Start a resumable upload and select PUBLIC or PRIVATE visibility.",
  ],
  [
    "GET",
    "/api/v1/uploads/:uploadId",
    "Read upload progress and uploaded chunk indexes.",
  ],
  [
    "PUT",
    "/api/v1/uploads/:uploadId/chunks/:chunkIndex",
    "Send one application/octet-stream chunk.",
  ],
  [
    "POST",
    "/api/v1/uploads/:uploadId/complete",
    "Assemble the asset and return imgUrl/fileUrl fields.",
  ],
  [
    "DELETE",
    "/api/v1/uploads/:uploadId",
    "Abort an incomplete upload and release reserved quota.",
  ],
  [
    "GET",
    "/api/v1/media",
    "List assets with visibility and stable URL fields.",
  ],
  [
    "GET",
    "/api/v1/media/:assetId",
    "Read one asset and its available CDN URLs.",
  ],
  [
    "POST",
    "/api/v1/media/:assetId/delivery-token",
    "Create a temporary signed URL for private media.",
  ],
  [
    "PATCH",
    "/api/v1/media/:assetId",
    "Rename, move or change PUBLIC/PRIVATE visibility.",
  ],
  [
    "GET",
    "/i/:assetId",
    "Serve a public image or file from the short CDN URL.",
  ],
  ["GET", "/i/:assetId?variant=THUMBNAIL", "Serve a ready thumbnail variant."],
  ["GET", "/i/:assetId?variant=PREVIEW", "Serve a ready preview variant."],
] as const;

export const commonErrors = [
  ["400", "EMPTY_CHUNK", "Check the raw chunk body and chunk index."],
  ["401", "INVALID_API_KEY", "Check the Authorization header and key status."],
  [
    "402",
    "PREPAID_PAYG_NOT_ACTIVE",
    "Top up and activate prepaid PAYG, or use a subscription.",
  ],
  ["403", "INSUFFICIENT_SCOPE", "Create a key with the required API scope."],
  ["404", "MEDIA_NOT_FOUND", "Check the upload, folder or asset identifier."],
  [
    "409",
    "DUPLICATE_MEDIA",
    "Reuse the existingAsset returned in the error when appropriate.",
  ],
  [
    "410",
    "UPLOAD_EXPIRED",
    "Create a new upload session and restart the upload.",
  ],
  [
    "413",
    "PLAN_LIMIT_EXCEEDED",
    "Upgrade, top up PAYG or reduce the requested usage.",
  ],
  [
    "422",
    "VALIDATION_ERROR",
    "Correct the invalid request fields or declared media type.",
  ],
  ["429", "RATE_LIMITED", "Retry with exponential backoff and jitter."],
] as const;
