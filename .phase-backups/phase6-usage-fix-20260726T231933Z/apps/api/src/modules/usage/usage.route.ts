import { Router } from "express";
import { prisma } from "@media/database";
import {
  authenticate,
  requireScope
} from "../../middleware/authenticate.js";
import { asyncHandler } from "../../shared/http.js";

const router = Router();
router.use(authenticate);

router.get(
  "/summary",
  requireScope("usage:read"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [
      workspace,
      mediaByType,
      readyAssets,
      deletedAssets,
      activeUploads,
      folders
    ] = await prisma.$transaction([
      prisma.workspace.findUnique({
        where: { id: auth.workspaceId },
        select: {
          storageLimitBytes: true,
          storageUsedBytes: true,
          storageReservedBytes: true
        }
      }),
      prisma.mediaAsset.groupBy({
        by: ["detectedMediaType"],
        where: {
          workspaceId: auth.workspaceId,
          status: "READY",
          deletedAt: null
        },
        _count: { _all: true },
        _sum: { sizeBytes: true }
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
      })
    ]);

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
        mediaByType: mediaByType.map(item => ({
          mediaType: item.detectedMediaType,
          count: item._count._all,
          sizeBytes: (item._sum.sizeBytes ?? 0n).toString()
        }))
      },
      meta: { requestId: req.id }
    });
  })
);

export default router;
