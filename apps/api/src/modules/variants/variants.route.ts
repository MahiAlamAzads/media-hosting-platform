import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  authenticate,
  requireScope
} from "../../middleware/authenticate.js";
import { ImageProcessor } from "../processing/image-processor.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();
const routeIdSchema = z.string().cuid();
const processor = new ImageProcessor();

router.use(authenticate);

router.get(
  "/media/:assetId",
  requireScope("media:read"),
  asyncHandler(async (req, res) => {
    const assetId = routeIdSchema.parse(req.params.assetId);

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: req.auth!.workspaceId
      },
      select: {
        id: true
      }
    });

    if (!asset) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Media asset was not found."
      );
    }

    const variants = await prisma.mediaVariant.findMany({
      where: {
        mediaAssetId: asset.id
      },
      orderBy: {
        kind: "asc"
      }
    });

    res.json({
      data: variants.map(variant => ({
        ...variant,
        sizeBytes: variant.sizeBytes?.toString() ?? null,
        publicPath:
          `/api/v1/public/media/${asset.id}?variant=${variant.kind}`
      })),
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/media/:assetId/process",
  requireScope("media:write"),
  asyncHandler(async (req, res) => {
    const assetId = routeIdSchema.parse(req.params.assetId);

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: req.auth!.workspaceId,
        detectedMediaType: "IMAGE",
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!asset) {
      throw new AppError(
        404,
        "IMAGE_NOT_FOUND",
        "Image asset was not found."
      );
    }

    await processor.process(asset.id);

    res.status(202).json({
      data: {
        assetId: asset.id,
        processingComplete: true
      },
      meta: { requestId: req.id }
    });
  })
);

export default router;
