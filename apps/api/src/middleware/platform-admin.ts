import type { NextFunction, Request, Response } from "express";
import { prisma } from "@media/database";
import { env } from "../config/env.js";
import { AppError } from "../shared/http.js";

export function platformAdminEmails(): Set<string> {
  return new Set(
    env.PLATFORM_ADMIN_EMAILS
      .split(",")
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isPlatformAdminEmail(
  normalizedEmail: string
): boolean {
  return platformAdminEmails().has(normalizedEmail);
}

export async function requirePlatformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.auth?.principalType !== "USER") {
      throw new AppError(
        403,
        "PLATFORM_ADMIN_REQUIRED",
        "Platform administrator access is required."
      );
    }

    const allowed = platformAdminEmails();

    if (allowed.size === 0) {
      throw new AppError(
        403,
        "PLATFORM_ADMIN_NOT_CONFIGURED",
        "Platform administrator access is not configured."
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { normalizedEmail: true }
    });

    if (!user || !allowed.has(user.normalizedEmail)) {
      throw new AppError(
        403,
        "PLATFORM_ADMIN_REQUIRED",
        "Platform administrator access is required."
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
