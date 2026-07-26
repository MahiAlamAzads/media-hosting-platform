import sharp from "sharp";
import { prisma } from "@media/database";
import {
  overwriteStorageFile,
  readStorageFile,
  storageFileSize
} from "../../infrastructure/storage.js";

type VariantSpec = {
  kind: "THUMBNAIL" | "PREVIEW";
  width: number;
  height: number;
  quality: number;
};

const specs: VariantSpec[] = [
  {
    kind: "THUMBNAIL",
    width: 320,
    height: 320,
    quality: 78
  },
  {
    kind: "PREVIEW",
    width: 1280,
    height: 1280,
    quality: 84
  }
];

export class ImageProcessor {
  async process(assetId: string): Promise<void> {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId }
    });

    if (
      !asset ||
      asset.deletedAt ||
      asset.detectedMediaType !== "IMAGE"
    ) {
      return;
    }

    const input = await readStorageFile(asset.storageKey);
    const metadata = await sharp(input).metadata();

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: "PROCESSING",
        width: metadata.width ?? null,
        height: metadata.height ?? null
      }
    });

    for (const spec of specs) {
      const storageKey =
        `tenants/${asset.workspaceId}/variants/${asset.id}/${spec.kind.toLowerCase()}.webp`;

      const variant = await prisma.mediaVariant.upsert({
        where: {
          mediaAssetId_kind: {
            mediaAssetId: asset.id,
            kind: spec.kind
          }
        },
        update: {
          status: "PROCESSING",
          errorMessage: null,
          storageKey,
          format: "webp",
          width: spec.width,
          height: spec.height,
          quality: spec.quality
        },
        create: {
          mediaAssetId: asset.id,
          kind: spec.kind,
          format: "webp",
          width: spec.width,
          height: spec.height,
          quality: spec.quality,
          storageKey,
          status: "PROCESSING"
        }
      });

      try {
        const output = await sharp(input)
          .rotate()
          .resize({
            width: spec.width,
            height: spec.height,
            fit: "inside",
            withoutEnlargement: true
          })
          .webp({
            quality: spec.quality
          })
          .toBuffer();

        await overwriteStorageFile(storageKey, output);
        const sizeBytes = await storageFileSize(storageKey);

        await prisma.mediaVariant.update({
          where: { id: variant.id },
          data: {
            status: "READY",
            sizeBytes,
            errorMessage: null
          }
        });
      } catch (error) {
        await prisma.mediaVariant.update({
          where: { id: variant.id },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Unknown processing error"
          }
        });

        throw error;
      }
    }

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: "READY"
      }
    });
  }
}
