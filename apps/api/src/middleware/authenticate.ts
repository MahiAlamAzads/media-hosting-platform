import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@media/database";
import { env } from "../config/env.js";
import { hashApiKeySecret, parseApiKey } from "../shared/api-key.js";
import { AppError } from "../shared/http.js";

type AccessClaims = {
  sub: string;
  workspaceId: string;
  sessionId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  passwordVersion: number;
  type: "access";
};

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requiredScopeForRequest(req: Request): string | null {
  if (req.baseUrl === "/api/v1/uploads") return "uploads:write";
  if (req.baseUrl === "/api/v1/folders") {
    return req.method === "GET" ? "folders:read" : "folders:write";
  }
  if (req.baseUrl === "/api/v1/media") {
    if (req.method === "GET") return "media:read";
    if (req.method === "DELETE") return "media:delete";
    if (req.method === "POST" && req.path.endsWith("/delivery-token")) {
      return "media:read";
    }
    return "media:write";
  }
  if (req.baseUrl === "/api/v1/usage") return "usage:read";
  return null;
}

async function authenticateApiKey(rawKey: string, req: Request): Promise<boolean> {
  const parsed = parseApiKey(rawKey);
  if (!parsed) return false;

  const record = await prisma.apiKey.findUnique({
    where: { keyId: parsed.keyId }
  });

  if (!record || record.revokedAt || (record.expiresAt && record.expiresAt <= new Date())) {
    return false;
  }

  if (!secureEqual(hashApiKeySecret(parsed.secret), record.secretHash)) {
    return false;
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: record.workspaceId,
      userId: record.createdById,
      workspace: { status: "ACTIVE" },
      user: { status: "ACTIVE", emailVerifiedAt: { not: null } }
    }
  });

  if (!membership) return false;

  const requiredScope = requiredScopeForRequest(req);
  if (requiredScope && !record.scopes.includes(requiredScope)) {
    throw new AppError(403, "INSUFFICIENT_SCOPE", `Required API scope: ${requiredScope}`);
  }

  req.auth = {
    principalType: "API_KEY",
    userId: record.createdById,
    workspaceId: record.workspaceId,
    apiKeyId: record.id,
    role: membership.role,
    scopes: record.scopes
  };

  void prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date(), lastUsedIp: req.ip }
  }).catch(() => undefined);

  return true;
}

async function authenticateUserToken(token: string, req: Request): Promise<void> {
  const claims = jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
    issuer: "media-platform",
    audience: "media-platform-api"
  }) as AccessClaims;

  if (
    claims.type !== "access" ||
    !claims.sub ||
    !claims.workspaceId ||
    !claims.sessionId
  ) {
    throw new Error("Invalid claims");
  }

  const session = await prisma.session.findFirst({
    where: {
      id: claims.sessionId,
      userId: claims.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: {
      user: true
    }
  });

  if (
    !session ||
    session.user.status !== "ACTIVE" ||
    !session.user.emailVerifiedAt ||
    session.user.passwordVersion !== claims.passwordVersion
  ) {
    throw new Error("Session is no longer valid");
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: claims.sub,
      workspaceId: claims.workspaceId,
      workspace: { status: "ACTIVE" }
    }
  });

  if (!membership) throw new Error("Workspace access no longer valid");

  req.auth = {
    principalType: "USER",
    userId: claims.sub,
    workspaceId: claims.workspaceId,
    sessionId: session.id,
    role: membership.role,
    scopes: ["*"]
  };

  void prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() }
  }).catch(() => undefined);
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authorization = req.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError(401, "AUTH_REQUIRED", "Authentication is required."));
    return;
  }

  const token = authorization.slice(7);

  try {
    if (token.startsWith("mh_live_")) {
      if (!(await authenticateApiKey(token, req))) {
        throw new AppError(401, "INVALID_API_KEY", "API key is invalid or expired.");
      }
    } else {
      await authenticateUserToken(token, req);
    }
    next();
  } catch (error) {
    next(
      error instanceof AppError
        ? error
        : new AppError(401, "INVALID_ACCESS_TOKEN", "Access token is invalid, expired or revoked.")
    );
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.principalType !== "USER") {
    next(new AppError(403, "USER_SESSION_REQUIRED", "A signed-in user session is required."));
    return;
  }
  next();
}

export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const scopes = req.auth?.scopes ?? [];
    if (!scopes.includes("*") && !scopes.includes(scope)) {
      next(new AppError(403, "INSUFFICIENT_SCOPE", `Required API scope: ${scope}`));
      return;
    }
    next();
  };
}
