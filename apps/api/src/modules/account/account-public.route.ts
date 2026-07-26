import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { hashOneTimeToken } from "../../shared/crypto.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();

router.post("/confirm-email", asyncHandler(async (req, res) => {
  const token = z.string().min(20).parse(req.body?.token);
  const record = await prisma.pendingEmailChange.findUnique({
    where: { tokenHash: hashOneTimeToken(token) }
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new AppError(400, "INVALID_TOKEN", "Email-change token is invalid or expired.");
  }

  const duplicate = await prisma.user.findUnique({
    where: { normalizedEmail: record.normalizedEmail }
  });
  if (duplicate && duplicate.id !== record.userId) {
    throw new AppError(409, "EMAIL_IN_USE", "Email address is unavailable.");
  }

  await prisma.$transaction([
    prisma.pendingEmailChange.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() }
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: {
        email: record.newEmail,
        normalizedEmail: record.normalizedEmail,
        emailVerifiedAt: new Date(),
        passwordVersion: { increment: 1 }
      }
    }),
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);

  res.json({ data: { changed: true }, meta: { requestId: req.id } });
}));

export default router;
