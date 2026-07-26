import {
  access,
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../shared/http.js";

const root = path.resolve(env.MEDIA_STORAGE_ROOT);

export function resolveStorageKey(storageKey: string): string {
  if (
    path.isAbsolute(storageKey) ||
    storageKey.includes("\0") ||
    storageKey.includes("\\")
  ) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Invalid storage key.");
  }

  const resolved = path.resolve(root, storageKey);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new AppError(
      400,
      "INVALID_STORAGE_KEY",
      "Storage key escapes the configured root."
    );
  }

  return resolved;
}

export async function ensureWorkspaceStorage(workspaceId: string): Promise<void> {
  const target = resolveStorageKey(`tenants/${workspaceId}`);

  await Promise.all([
    mkdir(path.join(target, "originals"), { recursive: true }),
    mkdir(path.join(target, "variants"), { recursive: true }),
    mkdir(path.join(target, "thumbnails"), { recursive: true }),
    mkdir(path.join(target, "trash"), { recursive: true }),
    mkdir(path.join(target, "temp"), { recursive: true })
  ]);
}

export async function writeStorageFile(
  storageKey: string,
  data: Buffer
): Promise<void> {
  const absolutePath = resolveStorageKey(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });

  const fileHandle = await open(absolutePath, "wx");

  try {
    await fileHandle.writeFile(data);
  } finally {
    await fileHandle.close();
  }
}

export async function overwriteStorageFile(
  storageKey: string,
  data: Buffer
): Promise<void> {
  const absolutePath = resolveStorageKey(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);
}

export async function concatenateStorageFiles(
  sourceKeys: string[],
  destinationKey: string
): Promise<void> {
  const destinationPath = resolveStorageKey(destinationKey);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, Buffer.alloc(0), { flag: "wx" });

  try {
    for (const sourceKey of sourceKeys) {
      const data = await readFile(resolveStorageKey(sourceKey));
      await appendFile(destinationPath, data);
    }
  } catch (error) {
    await rm(destinationPath, { force: true });
    throw error;
  }
}

export async function moveStorageFile(
  sourceKey: string,
  destinationKey: string
): Promise<void> {
  const sourcePath = resolveStorageKey(sourceKey);
  const destinationPath = resolveStorageKey(destinationKey);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await rename(sourcePath, destinationPath);
}

export async function removeStorageFile(storageKey: string): Promise<void> {
  await rm(resolveStorageKey(storageKey), { force: true });
}

export async function storageFileSize(storageKey: string): Promise<bigint> {
  const result = await stat(resolveStorageKey(storageKey));
  return BigInt(result.size);
}

export async function storageFileChecksum(storageKey: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(resolveStorageKey(storageKey));

  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }

  return hash.digest("hex");
}

export async function readStorageFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveStorageKey(storageKey));
}

export async function readStoragePrefix(
  storageKey: string,
  maxBytes = 4100
): Promise<Buffer> {
  const fileHandle = await open(resolveStorageKey(storageKey), "r");

  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await fileHandle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

export function createStorageReadStream(
  storageKey: string,
  options?: { start?: number; end?: number }
) {
  return createReadStream(resolveStorageKey(storageKey), options);
}

export async function storageHealth() {
  await mkdir(root, { recursive: true });
  await access(root, constants.R_OK | constants.W_OK);

  const stats = await statfs(root);
  const totalBytes = BigInt(stats.blocks) * BigInt(stats.bsize);
  const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize);

  return {
    status:
      freeBytes > BigInt(env.MEDIA_STORAGE_RESERVED_BYTES)
        ? "healthy"
        : "degraded",
    mounted: true,
    writable: true,
    totalBytes: totalBytes.toString(),
    freeBytes: freeBytes.toString(),
    reservedBytes: String(env.MEDIA_STORAGE_RESERVED_BYTES)
  };
}
