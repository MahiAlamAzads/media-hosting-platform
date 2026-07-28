import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import multipart from "@fastify/multipart";
import { MediaPlatformClient } from "./media-platform-client.mjs";

export default async function mediaRoutes(
  fastify
) {
  await fastify.register(multipart);

  const client = new MediaPlatformClient({
    baseUrl:
      process.env.MEDIA_PLATFORM_API_URL,
    apiKey:
      process.env.MEDIA_PLATFORM_API_KEY
  });

  fastify.post(
    "/media",
    async (request, reply) => {
      const part = await request.file();

      if (!part) {
        return reply.code(400).send({
          error: "file is required"
        });
      }

      const visibility =
        String(
          request.query?.visibility ??
            "PUBLIC"
        ).toUpperCase() === "PRIVATE"
          ? "PRIVATE"
          : "PUBLIC";

      const tempPath = join(
        tmpdir(),
        `${randomUUID()}-${part.filename}`
      );

      try {
        await pipeline(
          part.file,
          createWriteStream(tempPath)
        );

        const uploaded =
          await client.uploadFile(
            tempPath,
            {
              contentType:
                part.mimetype,
              visibility
            }
          );

        return reply.code(201).send({
          assetId: uploaded.assetId,
          filename: part.filename,
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
      } finally {
        await unlink(tempPath).catch(
          () => undefined
        );
      }
    }
  );
}
