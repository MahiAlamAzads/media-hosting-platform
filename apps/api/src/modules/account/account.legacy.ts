import argon2 from "argon2";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import { env } from "../../config/env.js";
import { hashOneTimeToken, randomToken } from "../../shared/crypto.js";
import { normalizeEmail } from "../../shared/auth-policy.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { isPlatformAdminEmail } from "../../middleware/platform-admin.js";

const router = Router();
router.use(authenticate, requireUser);

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        normalizedEmail: true,
        emailVerifiedAt: true,
        status: true,
        createdAt: true,
        memberships: {
          where: { workspaceId: req.auth!.workspaceId },
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");

    const { normalizedEmail, ...publicUser } = user;

    res.json({
      data: {
        ...publicUser,
        isPlatformAdmin: isPlatformAdminEmail(normalizedEmail),
      },
      meta: { requestId: req.id },
    });
  }),
);

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
      })
      .parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { name: input.name },
      select: { id: true, name: true, email: true },
    });

    res.json({ data: user, meta: { requestId: req.id } });
  }),
);

router.post(
  "/change-email",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        newEmail: z.string().trim().email().transform(normalizeEmail),
        currentPassword: z.string().min(1).max(128),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
    });
    if (
      !user ||
      !(await argon2.verify(user.passwordHash, input.currentPassword))
    ) {
      throw new AppError(
        401,
        "INVALID_CURRENT_PASSWORD",
        "Current password is incorrect.",
      );
    }

    if (input.newEmail === user.normalizedEmail) {
      throw new AppError(
        409,
        "EMAIL_UNCHANGED",
        "This is already your email address.",
      );
    }

    const existing = await prisma.user.findUnique({
      where: { normalizedEmail: input.newEmail },
    });
    if (existing)
      throw new AppError(409, "EMAIL_IN_USE", "Email address is unavailable.");

    const token = randomToken();

    await prisma.$transaction([
      prisma.pendingEmailChange.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.pendingEmailChange.create({
        data: {
          userId: user.id,
          newEmail: input.newEmail,
          normalizedEmail: input.newEmail,
          tokenHash: hashOneTimeToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      }),
    ]);

    await sendSecurityEmail({
      to: input.newEmail,
      subject: "Confirm your new email",
      text: `Confirm your new email: ${env.WEB_URL}/auth/confirm-email?token=${encodeURIComponent(token)}`,
    });

    res.json({ data: { pending: true }, meta: { requestId: req.id } });
  }),
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(128),
        confirmation: z.literal("DELETE"),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
    });
    if (
      !user ||
      !(await argon2.verify(user.passwordHash, input.currentPassword))
    ) {
      throw new AppError(
        401,
        "INVALID_CURRENT_PASSWORD",
        "Current password is incorrect.",
      );
    }

    const ownerships = await prisma.workspaceMember.count({
      where: { userId: user.id, role: "OWNER" },
    });
    if (ownerships > 0) {
      throw new AppError(
        409,
        "TRANSFER_OWNERSHIP_REQUIRED",
        "Transfer or delete owned workspaces before deleting your account.",
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          status: "DELETED",
          email: `deleted-${user.id}@deleted.invalid`,
          normalizedEmail: `deleted-${user.id}@deleted.invalid`,
          passwordVersion: { increment: 1 },
        },
      }),
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.apiKey.updateMany({
        where: { createdById: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    res.status(204).send();
  }),
);

export default router;
