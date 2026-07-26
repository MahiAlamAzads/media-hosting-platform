import { access, mkdir, statfs } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { env } from "../config/env.js";
import { AppError } from "../shared/http.js";

const root = path.resolve(env.MEDIA_STORAGE_ROOT);

export function resolveStorageKey(storageKey: string): string {
  if (path.isAbsolute(storageKey) || storageKey.includes("\0")) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Invalid storage key.");
  }
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key escapes the configured root.");
  }
  return resolved;
}

export async function ensureWorkspaceStorage(workspaceId: string): Promise<void> {
  const target = resolveStorageKey(`tenants/${workspaceId}`);
  await Promise.all([
    mkdir(path.join(target, "originals"), { recursive: true }),
    mkdir(path.join(target, "variants"), { recursive: true }),
    mkdir(path.join(target, "thumbnails"), { recursive: true }),
    mkdir(path.join(target, "trash"), { recursive: true })
  ]);
}

export async function storageHealth() {
  await mkdir(root, { recursive: true });
  await access(root, constants.R_OK | constants.W_OK);
  const stats = await statfs(root);
  const totalBytes = BigInt(stats.blocks) * BigInt(stats.bsize);
  const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize);
  return {
    status: freeBytes > BigInt(env.MEDIA_STORAGE_RESERVED_BYTES) ? "healthy" : "degraded",
    mounted: true,
    writable: true,
    totalBytes: totalBytes.toString(),
    freeBytes: freeBytes.toString(),
    reservedBytes: String(env.MEDIA_STORAGE_RESERVED_BYTES)
  };
}
