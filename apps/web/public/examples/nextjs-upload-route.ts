import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { MediaPlatformClient } from "@/lib/media-platform-client";

export const runtime = "nodejs";

const client = new MediaPlatformClient({
  baseUrl: process.env.MEDIA_PLATFORM_API_URL!,
  apiKey: process.env.MEDIA_PLATFORM_API_KEY!,
});

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const visibility =
    form.get("visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const tempPath = join(tmpdir(), `${randomUUID()}-${file.name}`);

  try {
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

    const uploaded = await client.uploadFile(tempPath, {
      contentType: file.type || "application/octet-stream",
      visibility,
    });

    return NextResponse.json({
      assetId: uploaded.assetId,
      visibility,
      imgUrl: uploaded.imgUrl,
      fileUrl: uploaded.fileUrl,
      deliveryUrl:
        visibility === "PRIVATE"
          ? await client.createDeliveryUrl(uploaded.assetId)
          : null,
    });
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
