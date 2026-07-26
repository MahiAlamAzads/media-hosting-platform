import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@media/database";
import { env } from "../config/env.js";
import { hashApiKeySecret, parseApiKey } from "../shared/api-key.js";
import { AppError } from "../shared/http.js";


function requiredScopeForRequest(req: Request): string | null {
  if (req.baseUrl === "/api/v1/uploads") {
    return "uploads:write";
  }

  if (req.baseUrl === "/api/v1/folders") {
    return req.method === "GET"
      ? "folders:read"
      : "folders:write";
  }

  if (req.baseUrl === "/api/v1/media") {
    if (req.method === "GET") return "media:read";
    if (req.method === "DELETE") return "media:delete";

    if (
      req.method === "POST" &&
      req.path.endsWith("/delivery-token")
    ) {
      return "media:read";
    }

    return "media:write";
  }

  return null;
}

function apiKeyHasRequiredScope(req: Request): boolean {
  const requiredScope = requiredScopeForRequest(req);

  return (
    requiredScope === null ||
    req.auth?.scopes.includes(requiredScope) === true
  );
}

type AccessClaims = {
  sub: string;
  workspaceId: string;
  sessionId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  type: "access";
};

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function authenticateApiKey(
  rawKey: string,
  req: Request
): Promise<boolean> {
  const parsed = parseApiKey(rawKey);
  if (!parsed) return false;

  const record = await prisma.apiKey.findUnique({
    where: { keyId: parsed.keyId }
  });

  if (
    !record ||
    record.revokedAt ||
    (record.expiresAt && record.expiresAt <= new Date())
  ) {
    return false;
  }

  const actualHash = hashApiKeySecret(parsed.secret);

  if (!secureEqual(actualHash, record.secretHash)) {
    return false;
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: record.workspaceId,
      userId: record.createdById
    }
  });

  if (!membership) return false;

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
    data: {
      lastUsedAt: new Date(),
      lastUsedIp: req.ip
    }
  }).catch(() => undefined);

  return true;
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

  if (token.startsWith("mh_live_")) {
    if (await authenticateApiKey(token, req)) {
      if (!apiKeyHasRequiredScope(req)) {
        next(
          new AppError(
            403,
            "INSUFFICIENT_SCOPE",
            `API key does not have permission for ${req.method} ${req.baseUrl}${req.path}.`
          )
        );
        return;
      }

      next();
      return;
    }

    next(new AppError(401, "INVALID_API_KEY", "API key is invalid or expired."));
    return;
  }

  try {
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
      throw new Error("Invalid access-token claims.");
    }

    req.auth = {
      principalType: "USER",
      userId: claims.sub,
      workspaceId: claims.workspaceId,
      sessionId: claims.sessionId,
      role: claims.role,
      scopes: ["*"]
    };

    next();
  } catch {
    next(
      new AppError(
        401,
        "INVALID_ACCESS_TOKEN",
        "Access token is invalid or expired."
      )
    );
  }
}

export function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.auth?.principalType !== "USER") {
    next(
      new AppError(
        403,
        "USER_SESSION_REQUIRED",
        "A signed-in user session is required."
      )
    );
    return;
  }

  next();
}

export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const scopes = req.auth?.scopes ?? [];

    if (!scopes.includes("*") && !scopes.includes(scope)) {
      next(
        new AppError(
          403,
          "INSUFFICIENT_SCOPE",
          `Required API scope: ${scope}`
        )
      );
      return;
    }

    next();
  };
}
