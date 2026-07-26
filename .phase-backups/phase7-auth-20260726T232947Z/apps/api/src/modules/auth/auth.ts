import argon2 from "argon2";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { env } from "../../config/env.js";
import { ensureWorkspaceStorage } from "../../infrastructure/storage.js";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import { hashOneTimeToken, hashRefreshToken, randomToken } from "../../shared/crypto.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();
const refreshCookie = "media_refresh";

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(12).max(128);
const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema });
const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(80) });
const tokenSchema = z.object({ token: z.string().min(20) });

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  } as const;
}

function signAccessToken(input: {
  userId: string;
  workspaceId: string;
  sessionId: string;
  role: string;
  passwordVersion: number;
}) {
  return jwt.sign(
    {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      role: input.role,
      passwordVersion: input.passwordVersion,
      type: "access"
    },
    env.ACCESS_TOKEN_SECRET,
    {
      subject: input.userId,
      issuer: "media-platform",
      audience: "media-platform-api",
      expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"]
    }
  );
}

async function createSession(userId: string, userAgent?: string, ipAddress?: string) {
  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenFamilyId: randomToken(24),
      tokenHash: hashRefreshToken(rawToken),
      userAgent,
      ipAddress,
      expiresAt
    }
  });
  return { session, rawToken };
}

router.post("/register", asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { normalizedEmail: input.email } });
  if (existing) throw new AppError(409, "EMAIL_IN_USE", "An account already exists for this email.");

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const verifyToken = randomToken();
  const slugBase = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";

  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, normalizedEmail: input.email, passwordHash }
    });
    const workspace = await tx.workspace.create({
      data: {
        name: `${input.name}'s Workspace`,
        slug: `${slugBase}-${user.id.slice(-6)}`,
        storageRootKey: `tenants/${user.id}`
      }
    });
    await tx.workspaceMember.create({
      data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" }
    });
    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOneTimeToken(verifyToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });
    return { user, workspace };
  });

  await ensureWorkspaceStorage(result.workspace.id);
  const verificationUrl = `${env.WEB_URL}/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
  await sendSecurityEmail({
    to: result.user.email,
    subject: "Verify your email",
    text: `Verify your account: ${verificationUrl}`
  });

  res.status(201).json({ data: { userId: result.user.id }, meta: { requestId: req.id } });
}));

router.post("/verify-email", asyncHandler(async (req, res) => {
  const { token } = tokenSchema.parse(req.body);
  const tokenHash = hashOneTimeToken(token);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new AppError(400, "INVALID_TOKEN", "Verification token is invalid or expired.");
  }
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } })
  ]);
  res.json({ data: { verified: true }, meta: { requestId: req.id } });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const input = credentialsSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { normalizedEmail: input.email },
    include: { memberships: { take: 1 } }
  });
  if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  if (!user.emailVerifiedAt) throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email first.");
  const membership = user.memberships[0];
  if (!membership) throw new AppError(403, "NO_WORKSPACE", "No workspace membership found.");

  const { session, rawToken } = await createSession(user.id, req.get("user-agent"), req.ip);
  const accessToken = signAccessToken({
    userId: user.id,
    workspaceId: membership.workspaceId,
    sessionId: session.id,
    role: membership.role,
    passwordVersion: user.passwordVersion
  });
  res.cookie(refreshCookie, rawToken, cookieOptions());
  res.json({
    data: {
      accessToken,
      expiresIn: 900,
      user: { id: user.id, name: user.name, email: user.email },
      workspaceId: membership.workspaceId
    },
    meta: { requestId: req.id }
  });
}));

router.post("/refresh", asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[refreshCookie];
  if (typeof rawToken !== "string") throw new AppError(401, "REFRESH_REQUIRED", "Refresh token required.");

  const tokenHash = hashRefreshToken(rawToken);
  const current = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!current || current.expiresAt <= new Date()) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid.");
  }
  if (current.revokedAt) {
    await prisma.session.updateMany({
      where: { tokenFamilyId: current.tokenFamilyId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    throw new AppError(401, "REFRESH_REUSE_DETECTED", "Session family revoked.");
  }

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: current.userId } });
  if (!membership) throw new AppError(403, "NO_WORKSPACE", "No workspace membership found.");

  const nextRawToken = randomToken();
  const next = await prisma.$transaction(async tx => {
    await tx.session.update({ where: { id: current.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
    return tx.session.create({
      data: {
        userId: current.userId,
        tokenFamilyId: current.tokenFamilyId,
        tokenHash: hashRefreshToken(nextRawToken),
        userAgent: req.get("user-agent"),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000)
      }
    });
  });

  res.cookie(refreshCookie, nextRawToken, cookieOptions());
  res.json({
    data: {
      accessToken: signAccessToken({
        userId: current.userId,
        workspaceId: membership.workspaceId,
        sessionId: next.id,
        role: membership.role,
        passwordVersion: current.user.passwordVersion
      }),
      expiresIn: 900
    },
    meta: { requestId: req.id }
  });
}));

router.post("/logout", asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[refreshCookie];
  if (typeof rawToken === "string") {
    await prisma.session.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
  res.clearCookie(refreshCookie, cookieOptions());
  res.status(204).send();
}));

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const email = emailSchema.parse(req.body?.email);
  const user = await prisma.user.findUnique({ where: { normalizedEmail: email } });
  if (user) {
    const rawToken = randomToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOneTimeToken(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });
    await sendSecurityEmail({
      to: user.email,
      subject: "Reset your password",
      text: `Reset your password: ${env.WEB_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}`
    });
  }
  res.json({
    data: { message: "If an account exists, reset instructions have been sent." },
    meta: { requestId: req.id }
  });
}));

router.post("/reset-password", asyncHandler(async (req, res) => {
  const input = z.object({ token: z.string().min(20), password: passwordSchema }).parse(req.body);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashOneTimeToken(input.token) }
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new AppError(400, "INVALID_TOKEN", "Reset token is invalid or expired.");
  }
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordVersion: { increment: 1 } }
    }),
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);
  res.clearCookie(refreshCookie, cookieOptions());
  res.json({ data: { reset: true }, meta: { requestId: req.id } });
}));

export default router;
