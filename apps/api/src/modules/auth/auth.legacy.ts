import argon2 from "argon2";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { env } from "../../config/env.js";
import { ensureWorkspaceStorage } from "../../infrastructure/storage.js";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import {
  hashOneTimeToken,
  hashRefreshToken,
  randomToken,
} from "../../shared/crypto.js";
import {
  enforceLoginThrottle,
  normalizeEmail,
  recordLoginAttempt,
} from "../../shared/auth-policy.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { createFreeBillingForWorkspace } from "../billing/billing.service.js";

const router = Router();
const refreshCookie = "media_refresh";
const emailSchema = z.string().trim().email().transform(normalizeEmail);
const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.");
const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
});
const tokenSchema = z.object({ token: z.string().min(20) });

function accessTokenExpiresInSeconds(): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(env.ACCESS_TOKEN_TTL.trim());
  if (!match) return 900;

  const value = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[
    match[2] as "s" | "m" | "h" | "d"
  ];
  return value * multiplier;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400000,
  } as const;
}

function clearRefresh(res: import("express").Response) {
  res.clearCookie(refreshCookie, cookieOptions());
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
      type: "access",
    },
    env.ACCESS_TOKEN_SECRET,
    {
      subject: input.userId,
      issuer: "media-platform",
      audience: "media-platform-api",
      expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
    },
  );
}

async function issueVerification(user: { id: string; email: string }) {
  const rawToken = randomToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOneTimeToken(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    }),
  ]);

  await sendSecurityEmail({
    to: user.email,
    subject: "Verify your email",
    text: `Verify your account: ${env.WEB_URL}/auth/verify-email?token=${encodeURIComponent(rawToken)}`,
  });
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { normalizedEmail: input.email },
    });

    if (existing) {
      res.status(202).json({
        data: {
          message:
            "If this email can be registered, verification instructions will be sent.",
        },
        meta: { requestId: req.id },
      });
      return;
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const slugBase =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "workspace";

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          normalizedEmail: input.email,
          passwordHash,
        },
      });
      const workspace = await tx.workspace.create({
        data: {
          name: `${input.name}'s Workspace`,
          slug: `${slugBase}-${user.id.slice(-6)}`,
          storageRootKey: `tenants/${user.id}`,
          storageLimitBytes: 2147483648n,
        },
      });
      await tx.workspaceMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
      });
      await createFreeBillingForWorkspace(tx, {
        workspaceId: workspace.id,
        billingEmail: user.email,
        currency: "BDT",
      });
      return { user, workspace };
    });

    await ensureWorkspaceStorage(result.workspace.id);
    await issueVerification(result.user);

    res.status(201).json({
      data: { message: "Check your email to verify the account." },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = tokenSchema.parse(req.body);
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashOneTimeToken(token) },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "Verification token is invalid or expired.",
      );
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    res.json({ data: { verified: true }, meta: { requestId: req.id } });
  }),
);

router.post(
  "/resend-verification",
  asyncHandler(async (req, res) => {
    const email = emailSchema.parse(req.body?.email);
    const user = await prisma.user.findUnique({
      where: { normalizedEmail: email },
    });

    if (user && !user.emailVerifiedAt) {
      const recent = await prisma.emailVerificationToken.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });
      if (recent === 0) await issueVerification(user);
    }

    res.json({
      data: {
        message: "If verification is required, a new email will be sent.",
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    await enforceLoginThrottle(input.email, req.ip);

    const user = await prisma.user.findUnique({
      where: { normalizedEmail: input.email },
      include: {
        memberships: {
          where: { workspace: { status: "ACTIVE" } },
          take: 1,
        },
      },
    });

    const passwordValid = user
      ? await argon2
          .verify(user.passwordHash, input.password)
          .catch(() => false)
      : false;

    if (!user || !passwordValid || user.status !== "ACTIVE") {
      await recordLoginAttempt({
        normalizedEmail: input.email,
        userId: user?.id,
        ipAddress: req.ip,
        succeeded: false,
        reason: "invalid_credentials",
      });
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }

    if (!user.emailVerifiedAt) {
      await recordLoginAttempt({
        normalizedEmail: input.email,
        userId: user.id,
        ipAddress: req.ip,
        succeeded: false,
        reason: "email_not_verified",
      });
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email first.");
    }

    const membership = user.memberships[0];
    if (!membership)
      throw new AppError(
        403,
        "NO_WORKSPACE",
        "No active workspace membership found.",
      );

    const rawToken = randomToken();
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenFamilyId: randomToken(24),
        tokenHash: hashRefreshToken(rawToken),
        userAgent: req.get("user-agent"),
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
      },
    });

    await recordLoginAttempt({
      normalizedEmail: input.email,
      userId: user.id,
      ipAddress: req.ip,
      succeeded: true,
    });

    res.cookie(refreshCookie, rawToken, cookieOptions());
    res.json({
      data: {
        accessToken: signAccessToken({
          userId: user.id,
          workspaceId: membership.workspaceId,
          sessionId: session.id,
          role: membership.role,
          passwordVersion: user.passwordVersion,
        }),
        expiresIn: accessTokenExpiresInSeconds(),
        user: { id: user.id, name: user.name, email: user.email },
        workspaceId: membership.workspaceId,
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const rawToken = req.cookies?.[refreshCookie];
    if (typeof rawToken !== "string") {
      throw new AppError(401, "REFRESH_REQUIRED", "Refresh token required.");
    }

    const current = await prisma.session.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      include: { user: true },
    });

    if (!current || current.expiresAt <= new Date()) {
      clearRefresh(res);
      throw new AppError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Refresh token is invalid.",
      );
    }

    if (current.revokedAt) {
      await prisma.$transaction([
        prisma.session.updateMany({
          where: { tokenFamilyId: current.tokenFamilyId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.session.update({
          where: { id: current.id },
          data: { reuseDetectedAt: new Date() },
        }),
        prisma.securityEvent.create({
          data: {
            userId: current.userId,
            eventType: "refresh_token_reuse",
            severity: "high",
            ipAddress: req.ip,
            metadata: { tokenFamilyId: current.tokenFamilyId },
          },
        }),
      ]);
      clearRefresh(res);
      throw new AppError(
        401,
        "REFRESH_REUSE_DETECTED",
        "Session family revoked.",
      );
    }

    if (current.user.status !== "ACTIVE" || !current.user.emailVerifiedAt) {
      clearRefresh(res);
      throw new AppError(401, "ACCOUNT_UNAVAILABLE", "Account is unavailable.");
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: current.userId,
        workspace: { status: "ACTIVE" },
      },
    });
    if (!membership)
      throw new AppError(
        403,
        "NO_WORKSPACE",
        "No active workspace membership found.",
      );

    const nextRawToken = randomToken();

    const next = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId: current.userId,
          tokenFamilyId: current.tokenFamilyId,
          tokenHash: hashRefreshToken(nextRawToken),
          userAgent: req.get("user-agent"),
          ipAddress: req.ip,
          expiresAt: new Date(
            Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000,
          ),
        },
      });
      await tx.session.update({
        where: { id: current.id },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          replacedBySessionId: created.id,
        },
      });
      return created;
    });

    res.cookie(refreshCookie, nextRawToken, cookieOptions());
    res.json({
      data: {
        accessToken: signAccessToken({
          userId: current.userId,
          workspaceId: membership.workspaceId,
          sessionId: next.id,
          role: membership.role,
          passwordVersion: current.user.passwordVersion,
        }),
        expiresIn: accessTokenExpiresInSeconds(),
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const rawToken = req.cookies?.[refreshCookie];
    if (typeof rawToken === "string") {
      await prisma.session.updateMany({
        where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefresh(res);
    res.status(204).send();
  }),
);

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const email = emailSchema.parse(req.body?.email);
    const user = await prisma.user.findUnique({
      where: { normalizedEmail: email },
    });

    if (user) {
      const recent = await prisma.passwordResetToken.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });

      if (recent === 0) {
        const rawToken = randomToken();
        await prisma.$transaction([
          prisma.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
          }),
          prisma.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashOneTimeToken(rawToken),
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
          }),
        ]);
        await sendSecurityEmail({
          to: user.email,
          subject: "Reset your password",
          text: `Reset your password: ${env.WEB_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}`,
        });
      }
    }

    res.json({
      data: {
        message: "If an account exists, reset instructions have been sent.",
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const input = z
      .object({ token: z.string().min(20), password: passwordSchema })
      .parse(req.body);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOneTimeToken(input.token) },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "Reset token is invalid or expired.",
      );
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordVersion: { increment: 1 } },
      }),
      prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.securityEvent.create({
        data: {
          userId: record.userId,
          eventType: "password_reset",
          severity: "medium",
          ipAddress: req.ip,
        },
      }),
    ]);

    clearRefresh(res);
    res.json({ data: { reset: true }, meta: { requestId: req.id } });
  }),
);

export default router;
