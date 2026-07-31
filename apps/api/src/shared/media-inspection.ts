import { readStoragePrefix } from "../infrastructure/storage.js";

type DetectedMedia = {
  contentType: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
};

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => buffer[index] === value);
}

export async function inspectStoredMedia(
  storageKey: string,
): Promise<DetectedMedia> {
  const buffer = await readStoragePrefix(storageKey);

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", mediaType: "IMAGE" };
  }

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", mediaType: "IMAGE" };
  }

  if (
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return { contentType: "image/gif", mediaType: "IMAGE" };
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", mediaType: "IMAGE" };
  }

  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { contentType: "application/pdf", mediaType: "DOCUMENT" };
  }

  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return { contentType: "video/mp4", mediaType: "VIDEO" };
  }

  if (
    buffer.subarray(0, 3).toString("ascii") === "ID3" ||
    startsWith(buffer, [0xff, 0xfb]) ||
    startsWith(buffer, [0xff, 0xf3]) ||
    startsWith(buffer, [0xff, 0xf2])
  ) {
    return { contentType: "audio/mpeg", mediaType: "AUDIO" };
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return { contentType: "audio/wav", mediaType: "AUDIO" };
  }

  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return { contentType: "application/ogg", mediaType: "AUDIO" };
  }

  return {
    contentType: "application/octet-stream",
    mediaType: "OTHER",
  };
}

export function declaredTypeMatchesDetectedType(
  declaredContentType: string,
  detected: DetectedMedia,
): boolean {
  if (detected.contentType === "application/octet-stream") {
    return true;
  }

  const declaredTopLevel = declaredContentType.split("/", 1)[0];
  const detectedTopLevel = detected.contentType.split("/", 1)[0];

  if (declaredContentType === "application/pdf") {
    return detected.contentType === "application/pdf";
  }

  return declaredTopLevel === detectedTopLevel;
}
