import { env } from "../../config/env.js";
import { cacheDelete } from "../../infrastructure/cache.js";

export type PublicVariantKind = "ORIGINAL" | "THUMBNAIL" | "PREVIEW";

export function publicDescriptorCacheId(
  assetId: string,
  variant: PublicVariantKind,
): string {
  return `${assetId}:${variant}`;
}

export function publicDescriptorTtlSeconds(variant: PublicVariantKind): number {
  return variant === "ORIGINAL"
    ? env.REDIS_PUBLIC_MEDIA_TTL_SECONDS
    : env.REDIS_PUBLIC_VARIANT_TTL_SECONDS;
}

export async function invalidatePublicMediaCache(
  assetId: string,
): Promise<void> {
  await cacheDelete(
    "public-media",
    publicDescriptorCacheId(assetId, "ORIGINAL"),
    publicDescriptorCacheId(assetId, "THUMBNAIL"),
    publicDescriptorCacheId(assetId, "PREVIEW"),
  );
}
