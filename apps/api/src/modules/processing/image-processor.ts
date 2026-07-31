import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma, Prisma } from "@media/database";
import { env } from "../../config/env.js";
import {
  overwriteStorageFile,
  readStorageFile,
  removeStorageFile,
} from "../../infrastructure/storage.js";
import { AppError } from "../../shared/http.js";
import {
  assertCountAllowedInTransaction,
  assertMeteredUsageAllowed,
  assertStorageDeltaAllowedInTransaction,
  lockWorkspaceQuota,
} from "../billing/quota.service.js";
import { recordUsageInTransaction } from "../billing/usage.service.js";
import { scheduleUsageAlertEvaluation } from "../billing/usage-alert.service.js";
import { invalidatePublicMediaCache } from "../public/public-media-cache.js";

type ExistingVariant = {
  kind: "THUMBNAIL" | "PREVIEW";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  sizeBytes: bigint | null;
  storageKey: string;
};

export type VariantSpec = {
  kind: "THUMBNAIL" | "PREVIEW";
  maxSize: number;
  quality: number;
};

export type ImageProcessingResult = {
  assetId: string;
  generated: Array<"THUMBNAIL" | "PREVIEW">;
  skipped: Array<"THUMBNAIL" | "PREVIEW">;
  outputFormat: "webp" | "avif";
};

export type ImageProcessingOptions = {
  force?: boolean;
};

export function imageVariantSpecs(): VariantSpec[] {
  return [
    {
      kind: "THUMBNAIL",
      maxSize: env.IMAGE_THUMBNAIL_MAX_SIZE,
      quality: env.IMAGE_THUMBNAIL_QUALITY,
    },
    {
      kind: "PREVIEW",
      maxSize: env.IMAGE_PREVIEW_MAX_SIZE,
      quality: env.IMAGE_PREVIEW_QUALITY,
    },
  ];
}

function orientedDimensions(metadata: {
  width?: number;
  height?: number;
  orientation?: number;
}): { width: number | null; height: number | null } {
  const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  return {
    width: rotated ? (metadata.height ?? null) : (metadata.width ?? null),
    height: rotated ? (metadata.width ?? null) : (metadata.height ?? null),
  };
}

type SharpPipeline = ReturnType<typeof sharp>;

function encodeVariant(
  pipeline: SharpPipeline,
  quality: number,
): SharpPipeline {
  return env.IMAGE_OPTIMIZATION_OUTPUT_FORMAT === "avif"
    ? pipeline.avif({
        quality,
        effort: env.IMAGE_OPTIMIZATION_EFFORT,
      })
    : pipeline.webp({
        quality,
        effort: env.IMAGE_OPTIMIZATION_EFFORT,
        smartSubsample: true,
      });
}

export class ImageProcessor {
  async process(
    assetId: string,
    options: ImageProcessingOptions = {},
  ): Promise<ImageProcessingResult> {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { variants: true },
    });

    if (!asset || asset.deletedAt || asset.detectedMediaType !== "IMAGE") {
      return {
        assetId,
        generated: [],
        skipped: [],
        outputFormat: env.IMAGE_OPTIMIZATION_OUTPUT_FORMAT,
      };
    }

    if (asset.status !== "READY") {
      throw new AppError(
        409,
        "MEDIA_NOT_READY",
        "The image is not ready for processing.",
      );
    }

    const specs = imageVariantSpecs();
    const existingByKind = new Map<"THUMBNAIL" | "PREVIEW", ExistingVariant>(
      asset.variants.map(
        (
          variant: ExistingVariant,
        ): ["THUMBNAIL" | "PREVIEW", ExistingVariant] => [
          variant.kind,
          variant,
        ],
      ),
    );
    const requestedSpecs = specs.filter((spec) => {
      if (options.force) return true;
      return existingByKind.get(spec.kind)?.status !== "READY";
    });
    const skipped = specs
      .filter((spec) => !requestedSpecs.includes(spec))
      .map((spec) => spec.kind);

    if (requestedSpecs.length === 0) {
      return {
        assetId: asset.id,
        generated: [],
        skipped,
        outputFormat: env.IMAGE_OPTIMIZATION_OUTPUT_FORMAT,
      };
    }

    const jobId = randomUUID();

    for (const spec of requestedSpecs) {
      await assertMeteredUsageAllowed(
        asset.workspaceId,
        "IMAGE_TRANSFORMATIONS",
        1n,
        `variant:${jobId}:${spec.kind}:transform`,
      );
    }

    await assertMeteredUsageAllowed(
      asset.workspaceId,
      "PROCESSING_CPU_MILLISECONDS",
      BigInt(env.PAYG_PROCESSING_AUTHORIZATION_MILLISECONDS),
      `processing:${jobId}:cpu`,
    );

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockWorkspaceQuota(tx, asset.workspaceId);

      const [activeUploads, processingAssets] = await Promise.all([
        tx.uploadSession.count({
          where: {
            workspaceId: asset.workspaceId,
            status: { in: ["ACTIVE", "COMPLETING"] },
          },
        }),
        tx.mediaAsset.count({
          where: {
            workspaceId: asset.workspaceId,
            status: "PROCESSING",
            deletedAt: null,
          },
        }),
      ]);

      await assertCountAllowedInTransaction(tx, {
        workspaceId: asset.workspaceId,
        metric: "CONCURRENT_JOBS",
        current: BigInt(activeUploads + processingAssets),
      });

      const claimed = await tx.mediaAsset.updateMany({
        where: {
          id: asset.id,
          workspaceId: asset.workspaceId,
          status: "READY",
          deletedAt: null,
        },
        data: { status: "PROCESSING" },
      });

      if (claimed.count !== 1) {
        throw new AppError(
          409,
          "MEDIA_PROCESSING_CONFLICT",
          "The image is already being processed.",
        );
      }
    });

    const startedAt = process.hrtime.bigint();
    const generated: Array<"THUMBNAIL" | "PREVIEW"> = [];

    try {
      const input = await readStorageFile(asset.storageKey);
      const metadata = await sharp(input, {
        failOn: "error",
        limitInputPixels: env.IMAGE_OPTIMIZATION_MAX_INPUT_PIXELS,
      }).metadata();
      const dimensions = orientedDimensions(metadata);
      const basePipeline = sharp(input, {
        failOn: "error",
        limitInputPixels: env.IMAGE_OPTIMIZATION_MAX_INPUT_PIXELS,
      }).rotate();

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: dimensions,
      });

      for (const spec of requestedSpecs) {
        const existing = existingByKind.get(spec.kind);
        const outputPipeline = basePipeline.clone().resize({
          width: spec.maxSize,
          height: spec.maxSize,
          fit: "inside",
          withoutEnlargement: true,
          fastShrinkOnLoad: true,
        });
        const output = await encodeVariant(
          outputPipeline,
          spec.quality,
        ).toBuffer({ resolveWithObject: true });

        const sizeBytes = BigInt(output.data.length);
        const previousSize = existing?.sizeBytes ?? 0n;
        const deltaBytes = sizeBytes - previousSize;
        const extension = env.IMAGE_OPTIMIZATION_OUTPUT_FORMAT;
        const storageKey =
          `tenants/${asset.workspaceId}/variants/${asset.id}/` +
          `${spec.kind.toLowerCase()}-${jobId}.${extension}`;

        await overwriteStorageFile(storageKey, output.data);

        try {
          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await assertStorageDeltaAllowedInTransaction(tx, {
              workspaceId: asset.workspaceId,
              deltaBytes,
              operationKey: `variant:${jobId}:${spec.kind}:storage`,
            });

            const variant = await tx.mediaVariant.upsert({
              where: {
                mediaAssetId_kind: {
                  mediaAssetId: asset.id,
                  kind: spec.kind,
                },
              },
              update: {
                status: "READY",
                errorMessage: null,
                storageKey,
                format: extension,
                width: output.info.width,
                height: output.info.height,
                quality: spec.quality,
                sizeBytes,
              },
              create: {
                mediaAssetId: asset.id,
                kind: spec.kind,
                format: extension,
                width: output.info.width,
                height: output.info.height,
                quality: spec.quality,
                storageKey,
                sizeBytes,
                status: "READY",
              },
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
                idempotencyKey: `variant:${jobId}:${spec.kind}:storage`,
                paygOperationKey: `variant:${jobId}:${spec.kind}:storage`,
                sourceType: "MEDIA_VARIANT",
                sourceId: variant.id,
                metadata: { assetId: asset.id },
              });
            }

            await recordUsageInTransaction(tx, {
              workspaceId: asset.workspaceId,
              metric: "IMAGE_TRANSFORMATIONS",
              quantity: 1n,
              idempotencyKey: `variant:${jobId}:${spec.kind}:transform`,
              paygOperationKey: `variant:${jobId}:${spec.kind}:transform`,
              sourceType: "MEDIA_VARIANT",
              sourceId: variant.id,
              metadata: {
                assetId: asset.id,
                width: output.info.width,
                height: output.info.height,
                format: extension,
                automatic: !options.force,
                metadataStripped: true,
              },
            });
          });
        } catch (error) {
          await removeStorageFile(storageKey).catch(() => undefined);
          throw error;
        }

        if (existing?.storageKey && existing.storageKey !== storageKey) {
          await removeStorageFile(existing.storageKey).catch((error) => {
            console.error("Failed to remove replaced image variant:", error);
          });
        }

        generated.push(spec.kind);
      }

      const elapsedMilliseconds =
        (process.hrtime.bigint() - startedAt) / 1_000_000n;

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { status: "READY" },
        });

        await recordUsageInTransaction(tx, {
          workspaceId: asset.workspaceId,
          metric: "PROCESSING_CPU_MILLISECONDS",
          quantity: elapsedMilliseconds,
          idempotencyKey: `processing:${jobId}:cpu`,
          paygOperationKey: `processing:${jobId}:cpu`,
          sourceType: "IMAGE_PROCESSING",
          sourceId: asset.id,
          metadata: {
            automatic: !options.force,
            generated,
          },
        });
      });

      scheduleUsageAlertEvaluation(asset.workspaceId);
      await invalidatePublicMediaCache(asset.id);

      return {
        assetId: asset.id,
        generated,
        skipped,
        outputFormat: env.IMAGE_OPTIMIZATION_OUTPUT_FORMAT,
      };
    } catch (error) {
      await prisma.mediaAsset
        .updateMany({
          where: {
            id: asset.id,
            status: "PROCESSING",
          },
          data: { status: "READY" },
        })
        .catch(() => undefined);

      throw error;
    }
  }
}
