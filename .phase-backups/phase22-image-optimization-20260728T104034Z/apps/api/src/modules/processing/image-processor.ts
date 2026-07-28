import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@media/database";
import { env } from "../../config/env.js";
import {
  overwriteStorageFile,
  readStorageFile,
  removeStorageFile
} from "../../infrastructure/storage.js";
import { AppError } from "../../shared/http.js";
import {
  assertCountAllowedInTransaction,
  assertMeteredUsageAllowed,
  assertStorageDeltaAllowedInTransaction,
  lockWorkspaceQuota
} from "../billing/quota.service.js";
import { recordUsageInTransaction } from "../billing/usage.service.js";
import { scheduleUsageAlertEvaluation } from "../billing/usage-alert.service.js";
import { invalidatePublicMediaCache } from "../public/public-media-cache.js";

export type VariantSpec = {
  kind: "THUMBNAIL" | "PREVIEW";
  width: number;
  height: number;
  quality: number;
};

export const imageVariantSpecs: VariantSpec[] = [
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

    if (asset.status !== "READY") {
      throw new AppError(
        409,
        "MEDIA_NOT_READY",
        "The image is not ready for processing."
      );
    }

    const jobId = randomUUID();

    for (const spec of imageVariantSpecs) {
      await assertMeteredUsageAllowed(
        asset.workspaceId,
        "IMAGE_TRANSFORMATIONS",
        1n,
        `variant:${jobId}:${spec.kind}:transform`
      );
    }

    // Reserve a conservative CPU allowance before starting. Actual usage is
    // recorded after processing and billed from the measured duration.
    await assertMeteredUsageAllowed(
      asset.workspaceId,
      "PROCESSING_CPU_MILLISECONDS",
      BigInt(env.PAYG_PROCESSING_AUTHORIZATION_MILLISECONDS),
      `processing:${jobId}:cpu`
    );

    await prisma.$transaction(async tx => {
      await lockWorkspaceQuota(tx, asset.workspaceId);

      const [activeUploads, processingAssets] = await Promise.all([
        tx.uploadSession.count({
          where: {
            workspaceId: asset.workspaceId,
            status: { in: ["ACTIVE", "COMPLETING"] }
          }
        }),
        tx.mediaAsset.count({
          where: {
            workspaceId: asset.workspaceId,
            status: "PROCESSING",
            deletedAt: null
          }
        })
      ]);

      await assertCountAllowedInTransaction(tx, {
        workspaceId: asset.workspaceId,
        metric: "CONCURRENT_JOBS",
        current: BigInt(activeUploads + processingAssets)
      });

      const claimed = await tx.mediaAsset.updateMany({
        where: {
          id: asset.id,
          workspaceId: asset.workspaceId,
          status: "READY",
          deletedAt: null
        },
        data: { status: "PROCESSING" }
      });

      if (claimed.count !== 1) {
        throw new AppError(
          409,
          "MEDIA_PROCESSING_CONFLICT",
          "The image is already being processed."
        );
      }
    });

    const startedAt = process.hrtime.bigint();

    try {
      const input = await readStorageFile(asset.storageKey);
      const metadata = await sharp(input).metadata();

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          width: metadata.width ?? null,
          height: metadata.height ?? null
        }
      });

      for (const spec of imageVariantSpecs) {
        const existing = await prisma.mediaVariant.findUnique({
          where: {
            mediaAssetId_kind: {
              mediaAssetId: asset.id,
              kind: spec.kind
            }
          }
        });

        const output = await sharp(input)
          .rotate()
          .resize({
            width: spec.width,
            height: spec.height,
            fit: "inside",
            withoutEnlargement: true
          })
          .webp({ quality: spec.quality })
          .toBuffer({ resolveWithObject: true });

        const sizeBytes = BigInt(output.data.length);
        const previousSize = existing?.sizeBytes ?? 0n;
        const deltaBytes = sizeBytes - previousSize;
        const storageKey =
          `tenants/${asset.workspaceId}/variants/${asset.id}/${spec.kind.toLowerCase()}-${jobId}.webp`;

        await overwriteStorageFile(storageKey, output.data);

        try {
          await prisma.$transaction(async tx => {
            await assertStorageDeltaAllowedInTransaction(tx, {
              workspaceId: asset.workspaceId,
              deltaBytes,
              operationKey:
                `variant:${jobId}:${spec.kind}:storage`
            });

            const variant = await tx.mediaVariant.upsert({
              where: {
                mediaAssetId_kind: {
                  mediaAssetId: asset.id,
                  kind: spec.kind
                }
              },
              update: {
                status: "READY",
                errorMessage: null,
                storageKey,
                format: "webp",
                width: output.info.width,
                height: output.info.height,
                quality: spec.quality,
                sizeBytes
              },
              create: {
                mediaAssetId: asset.id,
                kind: spec.kind,
                format: "webp",
                width: output.info.width,
                height: output.info.height,
                quality: spec.quality,
                storageKey,
                sizeBytes,
                status: "READY"
              }
            });

            if (deltaBytes !== 0n) {
              await tx.$executeRaw`
                UPDATE "Workspace"
                SET "storageUsedBytes" = GREATEST(
                  "storageUsedBytes" + ${deltaBytes},
                  0
                )
                WHERE "id" = ${asset.workspaceId}
              `;

              await recordUsageInTransaction(tx, {
                workspaceId: asset.workspaceId,
                metric: "STORAGE_BYTES",
                quantity: deltaBytes,
                idempotencyKey:
                  `variant:${jobId}:${spec.kind}:storage`,
                paygOperationKey:
                  `variant:${jobId}:${spec.kind}:storage`,
                sourceType: "MEDIA_VARIANT",
                sourceId: variant.id,
                metadata: { assetId: asset.id }
              });
            }

            await recordUsageInTransaction(tx, {
              workspaceId: asset.workspaceId,
              metric: "IMAGE_TRANSFORMATIONS",
              quantity: 1n,
              idempotencyKey:
                `variant:${jobId}:${spec.kind}:transform`,
              paygOperationKey:
                `variant:${jobId}:${spec.kind}:transform`,
              sourceType: "MEDIA_VARIANT",
              sourceId: variant.id,
              metadata: {
                assetId: asset.id,
                width: output.info.width,
                height: output.info.height,
                format: "webp"
              }
            });
          });
        } catch (error) {
          await removeStorageFile(storageKey).catch(() => undefined);
          throw error;
        }

        if (
          existing?.storageKey &&
          existing.storageKey !== storageKey
        ) {
          await removeStorageFile(existing.storageKey).catch(error => {
            console.error(
              "Failed to remove replaced image variant:",
              error
            );
          });
        }
      }

      const elapsedMilliseconds =
        (process.hrtime.bigint() - startedAt) / 1_000_000n;

      await prisma.$transaction(async tx => {
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { status: "READY" }
        });

        await recordUsageInTransaction(tx, {
          workspaceId: asset.workspaceId,
          metric: "PROCESSING_CPU_MILLISECONDS",
          quantity: elapsedMilliseconds,
          idempotencyKey: `processing:${jobId}:cpu`,
          paygOperationKey: `processing:${jobId}:cpu`,
          sourceType: "IMAGE_PROCESSING",
          sourceId: asset.id
        });
      });

      scheduleUsageAlertEvaluation(asset.workspaceId);
      await invalidatePublicMediaCache(asset.id);
    } catch (error) {
      await prisma.mediaAsset.updateMany({
        where: {
          id: asset.id,
          status: "PROCESSING"
        },
        data: { status: "READY" }
      }).catch(() => undefined);

      throw error;
    }
  }
}
