import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  createStorageReadStream,
  storageFileSize
} from "../../infrastructure/storage.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { recordUsage } from "../billing/usage.service.js";
import { assertMeteredUsageAllowed } from "../billing/quota.service.js";
import { cacheGetOrSet } from "../../infrastructure/cache.js";
import {
  publicDescriptorCacheId,
  publicDescriptorTtlSeconds
} from "./public-media-cache.js";

const router = Router();
const routeIdSchema = z.string().cuid();
const variantSchema = z.enum(["THUMBNAIL", "PREVIEW"]).optional();

type PublicDescriptor = {
  workspaceId: string;
  assetId: string;
  storageKey: string;
  contentType: string;
  contentLength: bigint;
  cacheControl: string;
  etag: string;
  variant?: "THUMBNAIL" | "PREVIEW";
};

function variantContentType(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "jpg") return "image/jpeg";
  if (normalized === "svg") return "image/svg+xml";
  return `image/${normalized}`;
}

async function loadPublicDescriptor(
  assetId: string,
  variantKind?: "THUMBNAIL" | "PREVIEW"
): Promise<PublicDescriptor> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: assetId,
      visibility: "PUBLIC",
      status: "READY",
      deletedAt: null
    }
  });

  if (!asset) {
    throw new AppError(
      404,
      "MEDIA_NOT_FOUND",
      "Public media asset was not found."
    );
  }

  if (variantKind) {
    const variant = await prisma.mediaVariant.findUnique({
      where: {
        mediaAssetId_kind: {
          mediaAssetId: asset.id,
          kind: variantKind
        }
      }
    });

    if (!variant || variant.status !== "READY") {
      throw new AppError(
        404,
        "VARIANT_NOT_FOUND",
        "Requested media variant was not found."
      );
    }

    const size = variant.sizeBytes ?? await storageFileSize(variant.storageKey);

    return {
      workspaceId: asset.workspaceId,
      assetId: asset.id,
      storageKey: variant.storageKey,
      contentType: variantContentType(variant.format),
      contentLength: size,
      cacheControl: "public, max-age=31536000, immutable",
      etag: `W/\"${variant.id}-${variant.updatedAt.getTime()}-${size.toString()}\"`,
      variant: variantKind
    };
  }

  const size = asset.sizeBytes || await storageFileSize(asset.storageKey);
  const etagValue =
    asset.checksumSha256 ??
    `${asset.id}-${asset.updatedAt.getTime()}-${size.toString()}`;

  return {
    workspaceId: asset.workspaceId,
    assetId: asset.id,
    storageKey: asset.storageKey,
    contentType: asset.detectedContentType ?? asset.contentType,
    contentLength: size,
    cacheControl: "public, max-age=3600, stale-while-revalidate=86400",
    etag: `\"${etagValue}\"`
  };
}

async function resolvePublicDescriptor(req: Request): Promise<PublicDescriptor> {
  const assetId = routeIdSchema.parse(req.params.assetId);
  const variantKind = variantSchema.parse(req.query.variant);
  const cacheVariant = variantKind ?? "ORIGINAL";

  return cacheGetOrSet(
    "public-media",
    publicDescriptorCacheId(assetId, cacheVariant),
    publicDescriptorTtlSeconds(cacheVariant),
    () => loadPublicDescriptor(assetId, variantKind)
  );
}

function setPublicHeaders(res: Response, descriptor: PublicDescriptor): void {
  res.setHeader("Content-Type", descriptor.contentType);
  res.setHeader("Content-Length", descriptor.contentLength.toString());
  res.setHeader("Cache-Control", descriptor.cacheControl);
  res.setHeader("ETag", descriptor.etag);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Timing-Allow-Origin", "*");
}

async function sendHead(req: Request, res: Response): Promise<void> {
  const descriptor = await resolvePublicDescriptor(req);
  setPublicHeaders(res, descriptor);
  res.status(200).end();
}

async function streamPublicFile(req: Request, res: Response): Promise<void> {
  const descriptor = await resolvePublicDescriptor(req);

  if (req.get("if-none-match") === descriptor.etag) {
    res.status(304);
    res.setHeader("ETag", descriptor.etag);
    res.setHeader("Cache-Control", descriptor.cacheControl);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end();
    return;
  }

  await assertMeteredUsageAllowed(
    descriptor.workspaceId,
    "DELIVERY_BYTES",
    descriptor.contentLength,
    `public-delivery:${req.id}`
  );

  setPublicHeaders(res, descriptor);
  res.status(200);

  res.once("finish", () => {
    void recordUsage({
      workspaceId: descriptor.workspaceId,
      metric: "DELIVERY_BYTES",
      quantity: descriptor.contentLength,
      idempotencyKey: `public-delivery:${req.id}`,
      paygOperationKey: `public-delivery:${req.id}`,
      sourceType: "PUBLIC_DELIVERY",
      sourceId: descriptor.assetId,
      metadata: {
        variant: descriptor.variant ?? null
      }
    }).catch(error => {
      req.log.error(
        { err: error },
        "failed to record public delivery usage"
      );
    });
  });

  const stream = createStorageReadStream(descriptor.storageKey);

  stream.on("error", error => {
    req.log.error({ err: error }, "public media stream failed");

    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy(error);
    }
  });

  stream.pipe(res);
}

const getHandler = asyncHandler(streamPublicFile);
const headHandler = asyncHandler(sendHead);

router.head("/:assetId", headHandler);
router.get("/:assetId", getHandler);
router.head("/media/:assetId", headHandler);
router.get("/media/:assetId", getHandler);

export default router;
