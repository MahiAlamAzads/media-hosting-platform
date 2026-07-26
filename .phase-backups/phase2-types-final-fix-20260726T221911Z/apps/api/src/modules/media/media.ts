import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { authenticate } from "../../middleware/authenticate.js";
import { moveStorageFile } from "../../infrastructure/storage.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();
router.use(authenticate);

router.get("/", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const query = z.object({
    folderId: z.string().cuid().optional(),
    status: z.enum(["READY", "UPLOADING", "FAILED", "DELETED"]).optional(),
    cursor: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(40)
  }).parse(req.query);

  const items = await prisma.mediaAsset.findMany({
    where: {
      workspaceId: auth.workspaceId,
      folderId: query.folderId,
      status: query.status ?? { not: "DELETED" },
      deletedAt: query.status === "DELETED" ? { not: null } : null
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
    data: page.map(item => ({
      ...item,
      sizeBytes: item.sizeBytes.toString()
    })),
    meta: {
      requestId: req.id,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null
    }
  });
}));

router.delete("/:assetId", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: req.params.assetId,
      workspaceId: auth.workspaceId,
      status: "READY",
      deletedAt: null
    }
  });

  if (!asset) {
    throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset was not found.");
  }

  const trashKey =
    `tenants/${auth.workspaceId}/trash/${asset.id}/${asset.originalFilename}`;

  await moveStorageFile(asset.storageKey, trashKey);

  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      storageKey: trashKey,
      status: "DELETED",
      deletedAt: new Date()
    }
  });

  res.status(204).send();
}));

router.post("/:assetId/restore", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: req.params.assetId,
      workspaceId: auth.workspaceId,
      status: "DELETED",
      deletedAt: { not: null }
    }
  });

  if (!asset) {
    throw new AppError(404, "MEDIA_NOT_FOUND", "Deleted media asset was not found.");
  }

  const restoredKey =
    `tenants/${auth.workspaceId}/originals/${asset.id}/${asset.originalFilename}`;

  await moveStorageFile(asset.storageKey, restoredKey);

  const restored = await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      storageKey: restoredKey,
      status: "READY",
      deletedAt: null
    }
  });

  res.json({
    data: {
      ...restored,
      sizeBytes: restored.sizeBytes.toString()
    },
    meta: { requestId: req.id }
  });
}));

export default router;
