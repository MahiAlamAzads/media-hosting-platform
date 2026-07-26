import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { authenticate } from "../../middleware/authenticate.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();
router.use(authenticate);

const folderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().cuid().nullable().optional()
});

const routeIdSchema = z.string().cuid();

router.get("/", asyncHandler(async (req, res) => {
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
}));

router.post("/", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const input = folderSchema.parse(req.body);

  let depth = 0;
  let pathKey = input.name;

  if (input.parentId) {
    const parent = await prisma.folder.findFirst({
      where: {
        id: input.parentId,
        workspaceId: auth.workspaceId
      }
    });

    if (!parent) {
      throw new AppError(
        404,
        "PARENT_FOLDER_NOT_FOUND",
        "Parent folder was not found."
      );
    }

    depth = parent.depth + 1;

    if (depth > 20) {
      throw new AppError(
        400,
        "FOLDER_DEPTH_EXCEEDED",
        "Folder nesting exceeds the maximum depth."
      );
    }

    pathKey = `${parent.pathKey}/${input.name}`;
  }

  const folder = await prisma.folder.create({
    data: {
      workspaceId: auth.workspaceId,
      parentId: input.parentId ?? null,
      name: input.name,
      pathKey,
      depth
    }
  });

  res.status(201).json({
    data: folder,
    meta: { requestId: req.id }
  });
}));

router.delete("/:folderId", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const folderId = routeIdSchema.parse(req.params.folderId);

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      workspaceId: auth.workspaceId
    }
  });

  if (!folder) {
    throw new AppError(404, "FOLDER_NOT_FOUND", "Folder was not found.");
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

  await prisma.folder.delete({
    where: { id: folder.id }
  });

  res.status(204).send();
}));

export default router;
