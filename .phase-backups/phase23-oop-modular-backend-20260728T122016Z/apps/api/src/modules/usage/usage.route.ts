import { Router } from "express";
import { prisma } from "@media/database";
import {
  authenticate,
  requireScope
} from "../../middleware/authenticate.js";
import { asyncHandler } from "../../shared/http.js";

const router = Router();

const mediaTypes = [
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "OTHER"
] as const;

router.use(authenticate);

router.get(
  "/summary",
  requireScope("usage:read"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [
      workspace,
      readyAssets,
      deletedAssets,
      activeUploads,
      folders,
      ...mediaTypeAggregates
    ] = await prisma.$transaction([
      prisma.workspace.findUnique({
        where: { id: auth.workspaceId },
        select: {
          storageLimitBytes: true,
          storageUsedBytes: true,
          storageReservedBytes: true
        }
      }),
      prisma.mediaAsset.count({
        where: {
          workspaceId: auth.workspaceId,
          status: "READY",
          deletedAt: null
        }
      }),
      prisma.mediaAsset.count({
        where: {
          workspaceId: auth.workspaceId,
          status: "DELETED"
        }
      }),
      prisma.uploadSession.count({
        where: {
          workspaceId: auth.workspaceId,
          status: {
            in: ["ACTIVE", "COMPLETING"]
          }
        }
      }),
      prisma.folder.count({
        where: {
          workspaceId: auth.workspaceId
        }
      }),
      ...mediaTypes.map(mediaType =>
        prisma.mediaAsset.aggregate({
          where: {
            workspaceId: auth.workspaceId,
            status: "READY",
            deletedAt: null,
            detectedMediaType: mediaType
          },
          _count: {
            _all: true
          },
          _sum: {
            sizeBytes: true
          }
        })
      )
    ]);

    const mediaByType = mediaTypes.map((mediaType, index) => {
      const aggregate = mediaTypeAggregates[index];

      return {
        mediaType,
        count: aggregate?._count._all ?? 0,
        sizeBytes: (
          aggregate?._sum.sizeBytes ?? 0n
        ).toString()
      };
    });

    res.json({
      data: {
        storage: workspace
          ? {
              limitBytes: workspace.storageLimitBytes.toString(),
              usedBytes: workspace.storageUsedBytes.toString(),
              reservedBytes: workspace.storageReservedBytes.toString(),
              availableBytes: (
                workspace.storageLimitBytes -
                workspace.storageUsedBytes -
                workspace.storageReservedBytes
              ).toString()
            }
          : null,
        counts: {
          readyAssets,
          deletedAssets,
          activeUploads,
          folders
        },
        mediaByType
      },
      meta: { requestId: req.id }
    });
  })
);

export default router;
