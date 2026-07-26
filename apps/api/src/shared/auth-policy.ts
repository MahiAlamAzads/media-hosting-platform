import { prisma } from "@media/database";
import { AppError } from "./http.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAIL_FAILURES = 8;
const MAX_IP_FAILURES = 30;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function enforceLoginThrottle(
  normalizedEmail: string,
  ipAddress?: string
): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS);

  const [emailFailures, ipFailures] = await Promise.all([
    prisma.loginAttempt.count({
      where: {
        normalizedEmail,
        succeeded: false,
        createdAt: { gte: since }
      }
    }),
    ipAddress
      ? prisma.loginAttempt.count({
          where: {
            ipAddress,
            succeeded: false,
            createdAt: { gte: since }
          }
        })
      : Promise.resolve(0)
  ]);

  if (
    emailFailures >= MAX_EMAIL_FAILURES ||
    ipFailures >= MAX_IP_FAILURES
  ) {
    throw new AppError(
      429,
      "LOGIN_TEMPORARILY_LOCKED",
      "Too many failed attempts. Try again later."
    );
  }
}

export async function recordLoginAttempt(input: {
  normalizedEmail: string;
  userId?: string;
  ipAddress?: string;
  succeeded: boolean;
  reason?: string;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      normalizedEmail: input.normalizedEmail,
      userId: input.userId,
      ipAddress: input.ipAddress,
      succeeded: input.succeeded,
      reason: input.reason
    }
  });
}
