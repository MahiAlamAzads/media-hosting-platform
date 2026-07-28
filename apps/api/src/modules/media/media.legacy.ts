import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  authenticate,
  requireScope
} from "../../middleware/authenticate.js";
import {
  moveStorageFile,
  removeStorageFile
} from "../../infrastructure/storage.js";
import { createDeliveryToken } from "../../shared/delivery-token.js";
import { normalizeResourceName } from "../../shared/path-key.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { buildMediaUrls } from "../../shared/media-url.js";
import { recordUsageInTransaction } from "../billing/usage.service.js";
import {
  assertCountAllowedInTransaction,
  lockWorkspaceQuota
} from "../billing/quota.service.js";
import { invalidatePublicMediaCache } from "../public/public-media-cache.js";

const router = Router();
router.use(authenticate);

const routeIdSchema = z.string().cuid();

router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const firstSegment = req.path.split("/").filter(Boolean)[0];
  const directAssetId = routeIdSchema.safeParse(firstSegment).success
    ? firstSegment
    : undefined;
  const bulkAssetIds: string[] = Array.isArray(req.body?.assetIds)
    ? (req.body.assetIds as unknown[]).filter(
        (value: unknown): value is string =>
          typeof value === "string" &&
          routeIdSchema.safeParse(value).success
      )
    : [];
  const assetIds: string[] = directAssetId
    ? [directAssetId]
    : bulkAssetIds;

  res.once("finish", () => {
    if (res.statusCode >= 400 || assetIds.length === 0) return;
    void Promise.all(
      assetIds.map((assetId: string) => invalidatePublicMediaCache(assetId))
    );
  });

  next();
});

function safeFilename(filename: string): string {
  return filename
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/\s+/g, "-")
    .slice(0, 180);
}

async function findAsset(
  assetId: string,
  workspaceId: string
) {
  return prisma.mediaAsset.findFirst({
    where: {
      id: assetId,
      workspaceId
    }
  });
}

async function ensureFolder(
  workspaceId: string,
  folderId: string | null
) {
  if (!folderId) return null;

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      workspaceId
    }
  });

  if (!folder) {
    throw new AppError(
      404,
      "FOLDER_NOT_FOUND",
      "Folder was not found."
    );
  }

  return folder;
}

router.get(
  "/",
  requireScope("media:read"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const query = z.object({
      folderId: z.string().cuid().optional(),
      status: z.enum(["READY", "UPLOADING", "FAILED", "DELETED"]).optional(),
      cursor: z.string().cuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
      search: z.string().trim().max(100).optional()
    }).parse(req.query);

    const items = await prisma.mediaAsset.findMany({
      where: {
        workspaceId: auth.workspaceId,
        folderId: query.folderId,
        status: query.status ?? { not: "DELETED" },
        deletedAt:
          query.status === "DELETED"
            ? { not: null }
            : null,
        ...(query.search
          ? {
              originalFilename: {
                contains: query.search,
                mode: "insensitive"
              }
            }
          : {})
      },
      include: {
        variants: {
          where: { status: "READY" },
          select: { kind: true }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1
          }
        : {})
    });

    const hasMore = items.length > query.limit;
    const page = hasMore ? items.slice(0, query.limit) : items;

    res.json({
      data: page.map(item => {
        const { variants, ...asset } = item;

        return {
          ...asset,
          sizeBytes: asset.sizeBytes.toString(),
          ...buildMediaUrls({
            assetId: asset.id,
            visibility: asset.visibility,
            status: asset.status,
            detectedMediaType: asset.detectedMediaType,
            readyVariants: variants.map(variant => variant.kind)
          })
        };
      }),
      meta: {
        requestId: req.id,
        nextCursor: hasMore
          ? page.at(-1)?.id ?? null
          : null
      }
    });
  })
);

router.get(
  "/:assetId",
  requireScope("media:read"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const assetId = routeIdSchema.parse(req.params.assetId);

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: auth.workspaceId
      },
      include: {
        folder: {
          select: {
            id: true,
            name: true,
            pathKey: true
          }
        },
        variants: {
          where: { status: "READY" },
          select: { kind: true }
        }
      }
    });

    if (!asset) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Media asset was not found."
      );
    }

    const { variants, ...media } = asset;

    res.json({
      data: {
        ...media,
        sizeBytes: media.sizeBytes.toString(),
        ...buildMediaUrls({
          assetId: media.id,
          visibility: media.visibility,
          status: media.status,
          detectedMediaType: media.detectedMediaType,
          readyVariants: variants.map(variant => variant.kind)
        })
      },
      meta: { requestId: req.id }
    });
  })
);

router.patch(
  "/:assetId",
  requireScope("media:write"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const assetId = routeIdSchema.parse(req.params.assetId);
    const input = z.object({
      originalFilename: z.string().trim().min(1).max(255).optional(),
      folderId: z.string().cuid().nullable().optional(),
      visibility: z.enum(["PRIVATE", "PUBLIC"]).optional()
    }).refine(
      value =>
        value.originalFilename !== undefined ||
        value.folderId !== undefined ||
        value.visibility !== undefined,
      "At least one field is required."
    ).parse(req.body);

    const asset = await findAsset(
      assetId,
      auth.workspaceId
    );

    if (!asset || asset.status === "DELETED") {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Media asset was not found."
      );
    }

    await ensureFolder(
      auth.workspaceId,
      input.folderId ?? asset.folderId
    );

    const originalFilename =
      input.originalFilename === undefined
        ? asset.originalFilename
        : normalizeResourceName(input.originalFilename);

    let storageKey = asset.storageKey;

    if (
      input.originalFilename !== undefined &&
      asset.status === "READY"
    ) {
      const nextStorageKey =
        `tenants/${auth.workspaceId}/originals/${asset.id}/${safeFilename(originalFilename)}`;

      if (nextStorageKey !== asset.storageKey) {
        await moveStorageFile(
          asset.storageKey,
          nextStorageKey
        );
        storageKey = nextStorageKey;
      }
    }

    try {
      const updated = await prisma.$transaction(async tx => {
        const result = await tx.mediaAsset.update({
          where: { id: asset.id },
          data: {
            originalFilename,
            folderId:
              input.folderId === undefined
                ? asset.folderId
                : input.folderId,
            visibility:
              input.visibility ?? asset.visibility,
            storageKey
          }
        });

        await tx.auditLog.create({
          data: {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: "media.updated",
            entityType: "MediaAsset",
            entityId: asset.id,
            metadata: {
              previousFilename: asset.originalFilename,
              originalFilename,
              previousFolderId: asset.folderId,
              folderId:
                input.folderId === undefined
                  ? asset.folderId
                  : input.folderId,
              visibility:
                input.visibility ?? asset.visibility
            },
            ipAddress: req.ip
          }
        });

        return result;
      });

      const readyVariants = await prisma.mediaVariant.findMany({
        where: {
          mediaAssetId: updated.id,
          status: "READY"
        },
        select: { kind: true }
      });

      res.json({
        data: {
          ...updated,
          sizeBytes: updated.sizeBytes.toString(),
          ...buildMediaUrls({
            assetId: updated.id,
            visibility: updated.visibility,
            status: updated.status,
            detectedMediaType: updated.detectedMediaType,
            readyVariants: readyVariants.map(variant => variant.kind)
          })
        },
        meta: { requestId: req.id }
      });
    } catch (error) {
      if (storageKey !== asset.storageKey) {
        await moveStorageFile(
          storageKey,
          asset.storageKey
        ).catch(() => undefined);
      }

      throw error;
    }
  })
);

router.post(
  "/:assetId/delivery-token",
  requireScope("media:read"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const assetId = routeIdSchema.parse(req.params.assetId);
    const input = z.object({
      disposition: z.enum(["inline", "attachment"]).default("inline")
    }).parse(req.body ?? {});

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: auth.workspaceId,
        status: "READY",
        deletedAt: null
      },
      select: { id: true }
    });

    if (!asset) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Media asset was not found."
      );
    }

    const token = createDeliveryToken({
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      assetId: asset.id,
      disposition: input.disposition
    });

    res.json({
      data: {
        token,
        path: `/api/v1/delivery/${token}`
      },
      meta: { requestId: req.id }
    });
  })
);

router.delete(
  "/:assetId",
  requireScope("media:delete"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const assetId = routeIdSchema.parse(req.params.assetId);

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: auth.workspaceId,
        status: "READY",
        deletedAt: null
      }
    });

    if (!asset) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Media asset was not found."
      );
    }

    const trashKey =
      `tenants/${auth.workspaceId}/trash/${asset.id}/${safeFilename(asset.originalFilename)}`;

    await moveStorageFile(asset.storageKey, trashKey);

    await prisma.$transaction(async tx => {
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: {
          storageKey: trashKey,
          status: "DELETED",
          deletedAt: new Date()
        }
      });

      await recordUsageInTransaction(tx, {
        workspaceId: auth.workspaceId,
        metric: "ACTIVE_ASSETS",
        quantity: -1n,
        idempotencyKey: `asset:${asset.id}:trashed:${req.id}`,
        sourceType: "MEDIA_ASSET",
        sourceId: asset.id
      });

      await tx.auditLog.create({
        data: {
          workspaceId: auth.workspaceId,
          actorId: auth.userId,
          action: "media.trashed",
          entityType: "MediaAsset",
          entityId: asset.id,
          metadata: {
            originalFilename: asset.originalFilename
          },
          ipAddress: req.ip
        }
      });
    });

    res.status(204).send();
  })
);

router.post(
  "/:assetId/restore",
  requireScope("media:write"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const assetId = routeIdSchema.parse(req.params.assetId);

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: auth.workspaceId,
        status: "DELETED",
        deletedAt: { not: null }
      }
    });

    if (!asset) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Deleted media asset was not found."
      );
    }

    const restoredKey =
      `tenants/${auth.workspaceId}/originals/${asset.id}/${safeFilename(asset.originalFilename)}`;

    let moved = false;

    const restored = await prisma.$transaction(async tx => {
      await lockWorkspaceQuota(tx, auth.workspaceId);

      const activeAssets = await tx.mediaAsset.count({
        where: {
          workspaceId: auth.workspaceId,
          status: { in: ["UPLOADING", "PROCESSING", "READY"] },
          deletedAt: null
        }
      });

      await assertCountAllowedInTransaction(tx, {
        workspaceId: auth.workspaceId,
        metric: "ACTIVE_ASSETS",
        current: BigInt(activeAssets)
      });

      await moveStorageFile(asset.storageKey, restoredKey);
      moved = true;

      const claimed = await tx.mediaAsset.updateMany({
        where: {
          id: asset.id,
          workspaceId: auth.workspaceId,
          status: "DELETED",
          deletedAt: { not: null }
        },
        data: {
          storageKey: restoredKey,
          status: "READY",
          deletedAt: null
        }
      });

      if (claimed.count !== 1) {
        throw new AppError(
          409,
          "MEDIA_RESTORE_CONFLICT",
          "Media restore state changed before completion."
        );
      }

      await recordUsageInTransaction(tx, {
        workspaceId: auth.workspaceId,
        metric: "ACTIVE_ASSETS",
        quantity: 1n,
        idempotencyKey: `asset:${asset.id}:restored:${req.id}`,
        sourceType: "MEDIA_ASSET",
        sourceId: asset.id
      });

      await tx.auditLog.create({
        data: {
          workspaceId: auth.workspaceId,
          actorId: auth.userId,
          action: "media.restored",
          entityType: "MediaAsset",
          entityId: asset.id,
          metadata: {
            originalFilename: asset.originalFilename
          },
          ipAddress: req.ip
        }
      });

      return tx.mediaAsset.findUniqueOrThrow({
        where: { id: asset.id }
      });
    }).catch(async error => {
      if (moved) {
        await moveStorageFile(restoredKey, asset.storageKey)
          .catch(() => undefined);
      }
      throw error;
    });

    res.json({
      data: {
        ...restored,
        sizeBytes: restored.sizeBytes.toString()
      },
      meta: { requestId: req.id }
    });
  })
);

router.delete(
  "/:assetId/permanent",
  requireScope("media:delete"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const assetId = routeIdSchema.parse(req.params.assetId);

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: auth.workspaceId,
        status: "DELETED",
        deletedAt: { not: null }
      },
      include: {
        variants: {
          select: { storageKey: true, sizeBytes: true }
        }
      }
    });

    if (!asset) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "Deleted media asset was not found."
      );
    }

    const variantBytes = asset.variants.reduce(
      (total, variant) => total + (variant.sizeBytes ?? 0n),
      0n
    );
    const totalBytes = asset.sizeBytes + variantBytes;
    const storageKeys = [
      asset.storageKey,
      ...asset.variants.map(variant => variant.storageKey)
    ];

    await prisma.$transaction(async tx => {
      await tx.mediaAsset.delete({
        where: { id: asset.id }
      });

      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageUsedBytes" = GREATEST(
          "storageUsedBytes" - ${totalBytes},
          0
        )
        WHERE "id" = ${auth.workspaceId}
      `;

      await recordUsageInTransaction(tx, {
        workspaceId: auth.workspaceId,
        metric: "STORAGE_BYTES",
        quantity: -totalBytes,
        idempotencyKey: `asset:${asset.id}:permanently-deleted`,
        sourceType: "MEDIA_ASSET",
        sourceId: asset.id,
        metadata: {
          originalBytes: asset.sizeBytes.toString(),
          variantBytes: variantBytes.toString()
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: auth.workspaceId,
          actorId: auth.userId,
          action: "media.permanently_deleted",
          entityType: "MediaAsset",
          entityId: asset.id,
          metadata: {
            originalFilename: asset.originalFilename,
            sizeBytes: totalBytes.toString(),
            variantCount: asset.variants.length
          },
          ipAddress: req.ip
        }
      });
    });

    const cleanup = await Promise.allSettled(
      storageKeys.map(storageKey => removeStorageFile(storageKey))
    );
    const cleanupFailures = cleanup.filter(
      result => result.status === "rejected"
    );

    if (cleanupFailures.length > 0) {
      req.log.error(
        { failures: cleanupFailures.length, assetId: asset.id },
        "one or more deleted media files could not be removed"
      );
    }

    res.status(204).send();
  })
);

router.post(
  "/bulk",
  requireScope("media:write"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const input = z.object({
      assetIds: z.array(z.string().cuid()).min(1).max(100),
      action: z.enum(["MOVE", "TRASH", "RESTORE"]),
      folderId: z.string().cuid().nullable().optional()
    }).parse(req.body);

    if (input.action === "MOVE") {
      await ensureFolder(
        auth.workspaceId,
        input.folderId ?? null
      );

      const result = await prisma.mediaAsset.updateMany({
        where: {
          id: { in: input.assetIds },
          workspaceId: auth.workspaceId,
          status: { not: "DELETED" }
        },
        data: {
          folderId: input.folderId ?? null
        }
      });

      res.json({
        data: {
          action: input.action,
          affected: result.count
        },
        meta: { requestId: req.id }
      });
      return;
    }

    const assets = await prisma.mediaAsset.findMany({
      where: {
        id: { in: input.assetIds },
        workspaceId: auth.workspaceId,
        status:
          input.action === "TRASH"
            ? "READY"
            : "DELETED"
      }
    });

    let affected = 0;

    for (const asset of assets) {
      if (input.action === "TRASH") {
        const trashKey =
          `tenants/${auth.workspaceId}/trash/${asset.id}/${safeFilename(asset.originalFilename)}`;

        let moved = false;

        await prisma.$transaction(async tx => {
          await moveStorageFile(asset.storageKey, trashKey);
          moved = true;

          const claimed = await tx.mediaAsset.updateMany({
            where: {
              id: asset.id,
              workspaceId: auth.workspaceId,
              status: "READY",
              deletedAt: null
            },
            data: {
              storageKey: trashKey,
              status: "DELETED",
              deletedAt: new Date()
            }
          });

          if (claimed.count !== 1) {
            throw new AppError(
              409,
              "MEDIA_TRASH_CONFLICT",
              "Media trash state changed before completion."
            );
          }

          await recordUsageInTransaction(tx, {
            workspaceId: auth.workspaceId,
            metric: "ACTIVE_ASSETS",
            quantity: -1n,
            idempotencyKey:
              `asset:${asset.id}:bulk-trashed:${req.id}`,
            sourceType: "MEDIA_BULK",
            sourceId: asset.id,
            metadata: { action: input.action }
          });
        }).catch(async error => {
          if (moved) {
            await moveStorageFile(trashKey, asset.storageKey)
              .catch(() => undefined);
          }
          throw error;
        });
      } else {
        const restoredKey =
          `tenants/${auth.workspaceId}/originals/${asset.id}/${safeFilename(asset.originalFilename)}`;

        let moved = false;

        await prisma.$transaction(async tx => {
          await lockWorkspaceQuota(tx, auth.workspaceId);

          const activeAssets = await tx.mediaAsset.count({
            where: {
              workspaceId: auth.workspaceId,
              status: { in: ["UPLOADING", "PROCESSING", "READY"] },
              deletedAt: null
            }
          });

          await assertCountAllowedInTransaction(tx, {
            workspaceId: auth.workspaceId,
            metric: "ACTIVE_ASSETS",
            current: BigInt(activeAssets)
          });

          await moveStorageFile(asset.storageKey, restoredKey);
          moved = true;

          const claimed = await tx.mediaAsset.updateMany({
            where: {
              id: asset.id,
              workspaceId: auth.workspaceId,
              status: "DELETED",
              deletedAt: { not: null }
            },
            data: {
              storageKey: restoredKey,
              status: "READY",
              deletedAt: null
            }
          });

          if (claimed.count !== 1) {
            throw new AppError(
              409,
              "MEDIA_RESTORE_CONFLICT",
              "Media restore state changed before completion."
            );
          }

          await recordUsageInTransaction(tx, {
            workspaceId: auth.workspaceId,
            metric: "ACTIVE_ASSETS",
            quantity: 1n,
            idempotencyKey:
              `asset:${asset.id}:bulk-restored:${req.id}`,
            sourceType: "MEDIA_BULK",
            sourceId: asset.id,
            metadata: { action: input.action }
          });
        }).catch(async error => {
          if (moved) {
            await moveStorageFile(restoredKey, asset.storageKey)
              .catch(() => undefined);
          }
          throw error;
        });
      }

      affected += 1;
    }

    await prisma.auditLog.create({
      data: {
        workspaceId: auth.workspaceId,
        actorId: auth.userId,
        action: `media.bulk_${input.action.toLowerCase()}`,
        entityType: "MediaAsset",
        metadata: {
          requested: input.assetIds.length,
          affected
        },
        ipAddress: req.ip
      }
    });

    res.json({
      data: {
        action: input.action,
        affected
      },
      meta: { requestId: req.id }
    });
  })
);

export default router;
