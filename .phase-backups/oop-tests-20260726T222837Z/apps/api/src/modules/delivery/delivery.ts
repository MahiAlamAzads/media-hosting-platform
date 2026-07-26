import path from "node:path";
import { Router } from "express";
import { prisma } from "@media/database";
import {
  createStorageReadStream,
  storageFileSize
} from "../../infrastructure/storage.js";
import { verifyDeliveryToken } from "../../shared/delivery-token.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();

function parseRange(
  rangeHeader: string,
  fileSize: number
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match) return null;

  const rawStart = match[1];
  const rawEnd = match[2];

  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;

    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1
    };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : fileSize - 1;

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
}

function contentDisposition(
  disposition: "inline" | "attachment",
  filename: string
): string {
  const safeAscii = path.basename(filename).replace(/[^\x20-\x7E]+/g, "_");
  const encoded = encodeURIComponent(path.basename(filename));

  return `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

router.get("/:token", asyncHandler(async (req, res) => {
  const rawToken = Array.isArray(req.params.token)
    ? req.params.token[0]
    : req.params.token;

  if (!rawToken) {
    throw new AppError(400, "DELIVERY_TOKEN_REQUIRED", "Delivery token is required.");
  }

  let claims;
  try {
    claims = verifyDeliveryToken(rawToken);
  } catch {
    throw new AppError(401, "INVALID_DELIVERY_TOKEN", "Delivery token is invalid or expired.");
  }

  if (claims.type !== "media-delivery") {
    throw new AppError(401, "INVALID_DELIVERY_TOKEN", "Delivery token type is invalid.");
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: claims.assetId,
      workspaceId: claims.workspaceId,
      status: "READY",
      deletedAt: null
    }
  });

  if (!asset) {
    throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset was not found.");
  }

  const fileSizeBigInt = await storageFileSize(asset.storageKey);

  if (fileSizeBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError(413, "MEDIA_TOO_LARGE", "Media file is too large for this delivery path.");
  }

  const fileSize = Number(fileSizeBigInt);
  const rangeHeader = req.get("range");
  const detectedContentType = asset.detectedContentType ?? asset.contentType;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", detectedContentType);
  res.setHeader(
    "Content-Disposition",
    contentDisposition(claims.disposition, asset.originalFilename)
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");

  if (!rangeHeader) {
    res.status(200);
    res.setHeader("Content-Length", String(fileSize));
    createStorageReadStream(asset.storageKey).pipe(res);
    return;
  }

  const range = parseRange(rangeHeader, fileSize);

  if (!range) {
    res.status(416);
    res.setHeader("Content-Range", `bytes */${fileSize}`);
    res.end();
    return;
  }

  const chunkLength = range.end - range.start + 1;

  res.status(206);
  res.setHeader(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${fileSize}`
  );
  res.setHeader("Content-Length", String(chunkLength));

  createStorageReadStream(asset.storageKey, range).pipe(res);
}));

export default router;
