import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  authenticate,
  requireUser
} from "../../middleware/authenticate.js";
import { asyncHandler } from "../../shared/http.js";

const router = Router();
router.use(authenticate, requireUser);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const query = z.object({
      cursor: z.string().cuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      action: z.string().trim().max(100).optional(),
      entityType: z.string().trim().max(100).optional()
    }).parse(req.query);

    const items = await prisma.auditLog.findMany({
      where: {
        workspaceId: auth.workspaceId,
        action: query.action,
        entityType: query.entityType
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1
          }
        : {})
    });

    const hasMore = items.length > query.limit;
    const page = hasMore
      ? items.slice(0, query.limit)
      : items;

    res.json({
      data: page,
      meta: {
        requestId: req.id,
        nextCursor: hasMore
          ? page.at(-1)?.id ?? null
          : null
      }
    });
  })
);

export default router;
