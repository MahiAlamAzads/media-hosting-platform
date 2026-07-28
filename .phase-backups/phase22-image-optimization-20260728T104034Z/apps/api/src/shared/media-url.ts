import { env } from "../config/env.js";

type MediaVariantKind = "THUMBNAIL" | "PREVIEW";

type MediaUrlInput = {
  assetId: string;
  visibility: "PRIVATE" | "PUBLIC";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | "DELETED";
  detectedMediaType: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
  readyVariants?: readonly MediaVariantKind[];
};

function publicBaseUrl(): string {
  return (env.CDN_PUBLIC_URL ?? env.API_PUBLIC_URL).replace(/\/+$/, "");
}

export function publicMediaPath(
  assetId: string,
  variant?: MediaVariantKind
): string {
  const suffix = variant
    ? `?variant=${encodeURIComponent(variant)}`
    : "";

  return `/i/${encodeURIComponent(assetId)}${suffix}`;
}

export function publicMediaUrl(
  assetId: string,
  variant?: MediaVariantKind
): string {
  return `${publicBaseUrl()}${publicMediaPath(assetId, variant)}`;
}

export function buildMediaUrlsForBase(
  baseUrl: string,
  input: MediaUrlInput
) {
  const isPublicReady =
    input.visibility === "PUBLIC" && input.status === "READY";
  const isImage = input.detectedMediaType === "IMAGE";
  const readyVariants = new Set(input.readyVariants ?? []);
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const absoluteUrl = (variant?: MediaVariantKind) =>
    `${normalizedBaseUrl}${publicMediaPath(input.assetId, variant)}`;
  const fileUrl = isPublicReady ? absoluteUrl() : null;

  return {
    isPublic: isPublicReady,
    cdnPath: isPublicReady
      ? publicMediaPath(input.assetId)
      : null,
    fileUrl,
    imgUrl: isImage ? fileUrl : null,
    thumbnailUrl:
      isPublicReady && isImage && readyVariants.has("THUMBNAIL")
        ? absoluteUrl("THUMBNAIL")
        : null,
    previewUrl:
      isPublicReady && isImage && readyVariants.has("PREVIEW")
        ? absoluteUrl("PREVIEW")
        : null
  };
}

export function buildMediaUrls(input: MediaUrlInput) {
  return buildMediaUrlsForBase(publicBaseUrl(), input);
}
