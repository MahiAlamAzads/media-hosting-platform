import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export const API_KEY_SCOPES = [
  "media:read",
  "media:write",
  "media:delete",
  "folders:read",
  "folders:write",
  "uploads:write",
  "usage:read"
] as const;

export type ApiKeyScope = typeof API_KEY_SCOPES[number];

export function createApiKeyMaterial(): {
  rawKey: string;
  keyId: string;
  prefix: string;
  secretHash: string;
} {
  const keyId = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const rawKey = `mh_live_${keyId}.${secret}`;

  return {
    rawKey,
    keyId,
    prefix: `mh_live_${keyId.slice(0, 8)}`,
    secretHash: hashApiKeySecret(secret)
  };
}

export function parseApiKey(rawKey: string): {
  keyId: string;
  secret: string;
} | null {
  const match = /^mh_live_([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{40,})$/.exec(rawKey);

  if (!match) return null;

  const [, keyId, secret] = match;

  if (!keyId || !secret) {
    return null;
  }

  return {
    keyId,
    secret
  };
}

export function hashApiKeySecret(secret: string): string {
  return createHmac("sha256", env.API_KEY_PEPPER)
    .update(secret)
    .digest("hex");
}
