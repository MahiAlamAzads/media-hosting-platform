import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../shared/http.js";

type AccessClaims = {
  sub: string;
  workspaceId: string;
  sessionId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  type: "access";
};

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError(401, "AUTH_REQUIRED", "Authentication is required."));
    return;
  }

  try {
    const claims = jwt.verify(authorization.slice(7), env.ACCESS_TOKEN_SECRET, {
      issuer: "media-platform",
      audience: "media-platform-api"
    }) as AccessClaims;

    if (claims.type !== "access" || !claims.sub || !claims.workspaceId || !claims.sessionId) {
      throw new Error("Invalid access-token claims.");
    }

    req.auth = {
      userId: claims.sub,
      workspaceId: claims.workspaceId,
      sessionId: claims.sessionId,
      role: claims.role
    };

    next();
  } catch {
    next(new AppError(401, "INVALID_ACCESS_TOKEN", "Access token is invalid or expired."));
  }
}
