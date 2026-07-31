import { createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env.REFRESH_TOKEN_PEPPER)
    .update(token)
    .digest("hex");
}
