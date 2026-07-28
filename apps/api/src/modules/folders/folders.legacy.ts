import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  authenticate,
  requireScope
} from "../../middleware/authenticate.js";
import {
  normalizeResourceName,
  replacePathPrefix
} from "../../shared/path-key.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import {
  assertCountAllowedInTransaction,
  lockWorkspaceQuota
} from "../billing/quota.service.js";
import { recordUsageInTransaction } from "../billing/usage.service.js";

const router = Router();
router.use(authenticate);

const routeIdSchema = z.string().cuid();

const folderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().cuid().nullable().optional()
});

async function findWorkspaceFolder(
  folderId: string,
  workspaceId: string
) {
  return prisma.folder.findFirst({
    where: {
      id: folderId,
      workspaceId
    }
  });
}

async function ensureValidParent(input: {
  workspaceId: string;
  parentId: string | null;
  movingFolderId?: string;
}) {
  if (!input.parentId) return null;

  const parent = await findWorkspaceFolder(
    input.parentId,
    input.workspaceId
  );

  if (!parent) {
    throw new AppError(
      404,
      "PARENT_FOLDER_NOT_FOUND",
      "Parent folder was not found."
    );
  }

  if (
    input.movingFolderId &&
    parent.id === input.movingFolderId
  ) {
    throw new AppError(
      409,
      "FOLDER_CYCLE",
      "A folder cannot be its own parent."
    );
  }

  return parent;
}

router.get(
  "/",
  requireScope("folders:read"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const parentId = z.string().cuid().nullable().optional().parse(
      req.query.parentId === "null" || req.query.parentId === undefined
        ? null
        : req.query.parentId
    );

    const folders = await prisma.folder.findMany({
      where: {
        workspaceId: auth.workspaceId,
        parentId
      },
      orderBy: { name: "asc" }
    });

    res.json({
      data: folders,
      meta: { requestId: req.id }
    });
  })
);

router.get(
  "/:folderId",
  requireScope("folders:read"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const folderId = routeIdSchema.parse(req.params.folderId);

    const folder = await findWorkspaceFolder(
      folderId,
      auth.workspaceId
    );

    if (!folder) {
      throw new AppError(
        404,
        "FOLDER_NOT_FOUND",
        "Folder was not found."
      );
    }

    const [children, mediaCount] = await prisma.$transaction([
      prisma.folder.findMany({
        where: {
          workspaceId: auth.workspaceId,
          parentId: folder.id
        },
        orderBy: { name: "asc" }
      }),
      prisma.mediaAsset.count({
        where: {
          workspaceId: auth.workspaceId,
          folderId: folder.id,
          deletedAt: null
        }
      })
    ]);

    res.json({
      data: {
        ...folder,
        children,
        mediaCount
      },
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/",
  requireScope("folders:write"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const input = folderSchema.parse(req.body);
    const name = normalizeResourceName(input.name);
    const parent = await ensureValidParent({
      workspaceId: auth.workspaceId,
      parentId: input.parentId ?? null
    });

    const depth = parent ? parent.depth + 1 : 0;

    if (depth > 20) {
      throw new AppError(
        400,
        "FOLDER_DEPTH_EXCEEDED",
        "Folder nesting exceeds the maximum depth."
      );
    }

    const pathKey = parent
      ? `${parent.pathKey}/${name}`
      : name;

    const folder = await prisma.$transaction(async tx => {
      await lockWorkspaceQuota(tx, auth.workspaceId);
      const currentFolders = await tx.folder.count({
        where: { workspaceId: auth.workspaceId }
      });
      await assertCountAllowedInTransaction(tx, {
        workspaceId: auth.workspaceId,
        metric: "FOLDERS",
        current: BigInt(currentFolders)
      });

      const created = await tx.folder.create({
        data: {
          workspaceId: auth.workspaceId,
          parentId: parent?.id ?? null,
          name,
          pathKey,
          depth
        }
      });

      await recordUsageInTransaction(tx, {
        workspaceId: auth.workspaceId,
        metric: "FOLDERS",
        quantity: 1n,
        idempotencyKey: `folder:${created.id}:created`,
        sourceType: "FOLDER",
        sourceId: created.id
      });

      await tx.auditLog.create({
        data: {
          workspaceId: auth.workspaceId,
          actorId: auth.userId,
          action: "folder.created",
          entityType: "Folder",
          entityId: created.id,
          metadata: {
            name: created.name,
            parentId: created.parentId
          },
          ipAddress: req.ip
        }
      });

      return created;
    });

    res.status(201).json({
      data: folder,
      meta: { requestId: req.id }
    });
  })
);

router.patch(
  "/:folderId",
  requireScope("folders:write"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const folderId = routeIdSchema.parse(req.params.folderId);
    const input = folderSchema.partial().refine(
      value =>
        value.name !== undefined ||
        value.parentId !== undefined,
      "At least one field is required."
    ).parse(req.body);

    const folder = await findWorkspaceFolder(
      folderId,
      auth.workspaceId
    );

    if (!folder) {
      throw new AppError(
        404,
        "FOLDER_NOT_FOUND",
        "Folder was not found."
      );
    }

    const parentId =
      input.parentId === undefined
        ? folder.parentId
        : input.parentId;

    const parent = await ensureValidParent({
      workspaceId: auth.workspaceId,
      parentId: parentId ?? null,
      movingFolderId: folder.id
    });

    if (
      parent &&
      (
        parent.pathKey === folder.pathKey ||
        parent.pathKey.startsWith(`${folder.pathKey}/`)
      )
    ) {
      throw new AppError(
        409,
        "FOLDER_CYCLE",
        "A folder cannot be moved inside itself."
      );
    }

    const name =
      input.name === undefined
        ? folder.name
        : normalizeResourceName(input.name);

    const newDepth = parent ? parent.depth + 1 : 0;

    if (newDepth > 20) {
      throw new AppError(
        400,
        "FOLDER_DEPTH_EXCEEDED",
        "Folder nesting exceeds the maximum depth."
      );
    }

    const newPathKey = parent
      ? `${parent.pathKey}/${name}`
      : name;

    const descendants = await prisma.folder.findMany({
      where: {
        workspaceId: auth.workspaceId,
        pathKey: {
          startsWith: `${folder.pathKey}/`
        }
      },
      orderBy: { depth: "asc" }
    });

    const depthDelta = newDepth - folder.depth;

    const updated = await prisma.$transaction(async tx => {
      const root = await tx.folder.update({
        where: { id: folder.id },
        data: {
          name,
          parentId: parent?.id ?? null,
          pathKey: newPathKey,
          depth: newDepth
        }
      });

      for (const descendant of descendants) {
        await tx.folder.update({
          where: { id: descendant.id },
          data: {
            pathKey: replacePathPrefix(
              descendant.pathKey,
              folder.pathKey,
              newPathKey
            ),
            depth: descendant.depth + depthDelta
          }
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: auth.workspaceId,
          actorId: auth.userId,
          action: "folder.updated",
          entityType: "Folder",
          entityId: folder.id,
          metadata: {
            previousName: folder.name,
            name,
            previousParentId: folder.parentId,
            parentId: parent?.id ?? null
          },
          ipAddress: req.ip
        }
      });

      return root;
    });

    res.json({
      data: updated,
      meta: { requestId: req.id }
    });
  })
);

router.delete(
  "/:folderId",
  requireScope("folders:write"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const folderId = routeIdSchema.parse(req.params.folderId);

    const folder = await findWorkspaceFolder(
      folderId,
      auth.workspaceId
    );

    if (!folder) {
      throw new AppError(
        404,
        "FOLDER_NOT_FOUND",
        "Folder was not found."
      );
    }

    const [childCount, mediaCount] = await prisma.$transaction([
      prisma.folder.count({
        where: {
          workspaceId: auth.workspaceId,
          parentId: folder.id
        }
      }),
      prisma.mediaAsset.count({
        where: {
          workspaceId: auth.workspaceId,
          folderId: folder.id
        }
      })
    ]);

    if (childCount > 0 || mediaCount > 0) {
      throw new AppError(
        409,
        "FOLDER_NOT_EMPTY",
        "Only empty folders can be deleted."
      );
    }

    await prisma.$transaction(async tx => {
      await tx.folder.delete({
        where: { id: folder.id }
      });

      await recordUsageInTransaction(tx, {
        workspaceId: auth.workspaceId,
        metric: "FOLDERS",
        quantity: -1n,
        idempotencyKey: `folder:${folder.id}:deleted`,
        sourceType: "FOLDER",
        sourceId: folder.id
      });

      await tx.auditLog.create({
        data: {
          workspaceId: auth.workspaceId,
          actorId: auth.userId,
          action: "folder.deleted",
          entityType: "Folder",
          entityId: folder.id,
          metadata: {
            name: folder.name
          },
          ipAddress: req.ip
        }
      });
    });

    res.status(204).send();
  })
);

export default router;
