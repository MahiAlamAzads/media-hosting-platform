import { MediaPlatformClient } from "./media-platform-client.mjs";

const [
  filePath,
  contentType = "application/octet-stream",
  visibilityInput = "PUBLIC"
] = process.argv.slice(2);

if (!filePath) {
  console.error(
    "Usage: node node-upload.mjs ./photo.jpg image/jpeg PUBLIC"
  );
  process.exit(1);
}

const visibility =
  visibilityInput.toUpperCase() === "PRIVATE"
    ? "PRIVATE"
    : "PUBLIC";

const client = new MediaPlatformClient({
  baseUrl:
    process.env.MEDIA_PLATFORM_API_URL ??
    "http://localhost:4000",
  apiKey: process.env.MEDIA_PLATFORM_API_KEY
});

const uploaded = await client.uploadFile(filePath, {
  contentType,
  visibility
});

console.log({
  assetId: uploaded.assetId,
  visibility,
  imgUrl: uploaded.imgUrl,
  fileUrl: uploaded.fileUrl,
  deliveryUrl:
    visibility === "PRIVATE"
      ? await client.createDeliveryUrl(
          uploaded.assetId
        )
      : null
});
