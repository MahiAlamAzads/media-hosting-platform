import argon2 from "argon2";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  authenticate,
  requireUser
} from "../../middleware/authenticate.js";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import { hashOneTimeToken, randomToken } from "../../shared/crypto.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { env } from "../../config/env.js";

const router = Router();
router.use(authenticate, requireUser);

router.get("/sessions", asyncHandler(async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: {
      userId: req.auth!.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true
    }
  });

  res.json({
    data: sessions.map(session => ({
      ...session,
      current: session.id === req.auth!.sessionId
    })),
    meta: { requestId: req.id }
  });
}));

router.delete("/sessions/:sessionId", asyncHandler(async (req, res) => {
  const sessionId = z.string().cuid().parse(req.params.sessionId);

  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      userId: req.auth!.userId,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });

  if (result.count !== 1) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Session was not found.");
  }

  res.status(204).send();
}));

router.post("/logout-all", asyncHandler(async (req, res) => {
  await prisma.session.updateMany({
    where: {
      userId: req.auth!.userId,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });

  res.status(204).send();
}));

router.post("/change-password", asyncHandler(async (req, res) => {
  const input = z.object({
    currentPassword: z.string().min(12).max(128),
    newPassword: z.string().min(12).max(128)
  }).parse(req.body);

  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId }
  });

  if (!user || !(await argon2.verify(user.passwordHash, input.currentPassword))) {
    throw new AppError(
      401,
      "INVALID_CURRENT_PASSWORD",
      "Current password is incorrect."
    );
  }

  const passwordHash = await argon2.hash(input.newPassword, {
    type: argon2.argon2id
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordVersion: { increment: 1 }
      }
    }),
    prisma.session.updateMany({
      where: {
        userId: user.id,
        id: { not: req.auth!.sessionId },
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    })
  ]);

  res.json({
    data: { changed: true },
    meta: { requestId: req.id }
  });
}));

router.post("/resend-verification", asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId }
  });

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
  }

  if (user.emailVerifiedAt) {
    res.json({
      data: { alreadyVerified: true },
      meta: { requestId: req.id }
    });
    return;
  }

  const rawToken = randomToken();

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOneTimeToken(rawToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  await sendSecurityEmail({
    to: user.email,
    subject: "Verify your email",
    text: `Verify your account: ${env.WEB_URL}/auth/verify-email?token=${encodeURIComponent(rawToken)}`
  });

  res.json({
    data: { sent: true },
    meta: { requestId: req.id }
  });
}));

export default router;
