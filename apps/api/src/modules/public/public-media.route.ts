import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  createStorageReadStream,
  storageFileSize
} from "../../infrastructure/storage.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();
const routeIdSchema = z.string().cuid();

router.get(
  "/media/:assetId",
  asyncHandler(async (req, res) => {
    const assetId = routeIdSchema.parse(req.params.assetId);
    const variantKind = z.enum(["THUMBNAIL", "PREVIEW"]).optional().parse(
      req.query.variant
    );

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

      const size = await storageFileSize(variant.storageKey);

      res.status(200);
      res.setHeader("Content-Type", `image/${variant.format}`);
      res.setHeader("Content-Length", size.toString());
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");

      createStorageReadStream(variant.storageKey).pipe(res);
      return;
    }

    const size = await storageFileSize(asset.storageKey);

    res.status(200);
    res.setHeader(
      "Content-Type",
      asset.detectedContentType ?? asset.contentType
    );
    res.setHeader("Content-Length", size.toString());
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");

    createStorageReadStream(asset.storageKey).pipe(res);
  })
);

export default router;
