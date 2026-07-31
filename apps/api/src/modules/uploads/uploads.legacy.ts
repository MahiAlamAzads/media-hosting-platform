import { createHash } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { authenticate } from "../../middleware/authenticate.js";
import {
  concatenateStorageFiles,
  ensureWorkspaceStorage,
  removeStorageFile,
  storageFileChecksum,
  storageFileSize,
  writeStorageFile,
} from "../../infrastructure/storage.js";
import {
  declaredTypeMatchesDetectedType,
  inspectStoredMedia,
} from "../../shared/media-inspection.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { buildMediaUrls } from "../../shared/media-url.js";
import { assertUploadAllowedInTransaction } from "../billing/quota.service.js";
import { recordUsageInTransaction } from "../billing/usage.service.js";
import { scheduleUsageAlertEvaluation } from "../billing/usage-alert.service.js";
import { invalidatePublicMediaCache } from "../public/public-media-cache.js";
import {
  enqueueImageOptimization,
  imageOptimizationResponse,
} from "../processing/image-optimization-scheduler.js";

const router = Router();
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
const PLATFORM_MAX_FILE_BYTES = 20 * 1024 * 1024 * 1024;

const routeIdSchema = z.string().cuid();
const chunkIndexSchema = z.coerce.number().int().nonnegative();

const initSchema = z
  .object({
    filename: z.string().trim().min(1).max(255).optional(),
    originalFilename: z.string().trim().min(1).max(255).optional(),
    contentType: z.string().trim().min(1).max(150),
    sizeBytes: z.coerce.number().int().positive().max(PLATFORM_MAX_FILE_BYTES),
    folderId: z.string().cuid().nullable().optional(),
    visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
    checksumSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.filename && !value.originalFilename) {
      context.addIssue({
        code: "custom",
        path: ["filename"],
        message: "filename is required.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    filename: value.filename ?? value.originalFilename!,
  }));

function mediaTypeFromContentType(contentType: string) {
  if (contentType.startsWith("image/")) return "IMAGE" as const;
  if (contentType.startsWith("video/")) return "VIDEO" as const;
  if (contentType.startsWith("audio/")) return "AUDIO" as const;
  if (contentType === "application/pdf" || contentType.startsWith("text/")) {
    return "DOCUMENT" as const;
  }
  return "OTHER" as const;
}

function safeFilename(filename: string): string {
  return filename
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/\s+/g, "-")
    .slice(0, 180);
}

router.use(authenticate);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const input = initSchema.parse(req.body);
    const expectedBytes = BigInt(input.sizeBytes);
    const visibility = input.visibility ?? "PRIVATE";

    const duplicate = input.checksumSha256
      ? await prisma.mediaAsset.findFirst({
          where: {
            workspaceId: auth.workspaceId,
            checksumSha256: input.checksumSha256.toLowerCase(),
            status: "READY",
            deletedAt: null,
          },
          select: {
            id: true,
            originalFilename: true,
            sizeBytes: true,
            visibility: true,
            status: true,
            detectedMediaType: true,
            variants: {
              where: { status: "READY" },
              select: { kind: true },
            },
          },
        })
      : null;

    if (duplicate) {
      res.status(409).json({
        error: {
          code: "DUPLICATE_MEDIA",
          message: "An identical media asset already exists.",
          existingAsset: {
            id: duplicate.id,
            originalFilename: duplicate.originalFilename,
            sizeBytes: duplicate.sizeBytes.toString(),
            visibility: duplicate.visibility,
            ...buildMediaUrls({
              assetId: duplicate.id,
              visibility: duplicate.visibility,
              status: duplicate.status,
              detectedMediaType: duplicate.detectedMediaType,
              readyVariants: duplicate.variants.map((variant) => variant.kind),
            }),
          },
          requestId: req.id,
        },
      });
      return;
    }

    await ensureWorkspaceStorage(auth.workspaceId);

    const chunkSizeBytes = DEFAULT_CHUNK_BYTES;
    const expectedChunks = Math.ceil(input.sizeBytes / chunkSizeBytes);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const paygOperationKeyPrefix = `upload:${req.id}`;

    const result = await prisma.$transaction(async (tx) => {
      const quota = await assertUploadAllowedInTransaction(tx, {
        workspaceId: auth.workspaceId,
        expectedBytes,
        operationKeyBase: paygOperationKeyPrefix,
      });

      if (input.folderId) {
        const folder = await tx.folder.findFirst({
          where: {
            id: input.folderId,
            workspaceId: auth.workspaceId,
          },
          select: { id: true },
        });

        if (!folder) {
          throw new AppError(404, "FOLDER_NOT_FOUND", "Folder was not found.");
        }
      }

      const asset = await tx.mediaAsset.create({
        data: {
          workspaceId: auth.workspaceId,
          folderId: input.folderId ?? null,
          createdById: auth.userId,
          originalFilename: input.filename,
          storageKey: `tenants/${auth.workspaceId}/originals/pending-${Date.now()}`,
          contentType: input.contentType,
          detectedMediaType: mediaTypeFromContentType(input.contentType),
          visibility,
          sizeBytes: expectedBytes,
          checksumSha256: input.checksumSha256?.toLowerCase(),
          status: "UPLOADING",
        },
      });

      const storageKey = `tenants/${auth.workspaceId}/originals/${asset.id}/${safeFilename(input.filename)}`;

      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: { storageKey },
      });

      const session = await tx.uploadSession.create({
        data: {
          workspaceId: auth.workspaceId,
          userId: auth.userId,
          mediaAssetId: asset.id,
          expectedBytes,
          chunkSizeBytes,
          expectedChunks,
          tempStorageKey: `tenants/${auth.workspaceId}/temp/${asset.id}`,
          paygOperationKeyPrefix,
          expiresAt,
        },
      });

      await tx.quotaReservation.createMany({
        data: [
          {
            workspaceId: auth.workspaceId,
            metric: "STORAGE_BYTES",
            quantity: expectedBytes,
            sourceType: "UPLOAD_SESSION",
            sourceId: session.id,
            expiresAt,
          },
          {
            workspaceId: auth.workspaceId,
            metric: "UPLOAD_BYTES",
            quantity: expectedBytes,
            sourceType: "UPLOAD_SESSION",
            sourceId: session.id,
            expiresAt,
          },
          {
            workspaceId: auth.workspaceId,
            metric: "ACTIVE_ASSETS",
            quantity: 1n,
            sourceType: "UPLOAD_SESSION",
            sourceId: session.id,
            expiresAt,
          },
        ],
      });

      await tx.workspace.update({
        where: { id: auth.workspaceId },
        data: {
          storageReservedBytes: {
            increment: expectedBytes,
          },
        },
      });

      return {
        assetId: asset.id,
        session,
        storageLimitBytes: quota.storageLimitBytes,
      };
    });

    res.status(201).json({
      data: {
        uploadId: result.session.id,
        assetId: result.assetId,
        chunkSizeBytes,
        expectedChunks,
        visibility,
        expiresAt: result.session.expiresAt,
        storageLimitBytes: result.storageLimitBytes.toString(),
      },
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/:uploadId",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const uploadId = routeIdSchema.parse(req.params.uploadId);

    const session = await prisma.uploadSession.findFirst({
      where: {
        id: uploadId,
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      },
    });

    if (!session) {
      throw new AppError(
        404,
        "UPLOAD_NOT_FOUND",
        "Upload session was not found.",
      );
    }

    const chunks = await prisma.uploadChunk.findMany({
      where: { uploadSessionId: session.id },
      orderBy: { chunkIndex: "asc" },
      select: {
        chunkIndex: true,
        sizeBytes: true,
      },
    });

    res.json({
      data: {
        id: session.id,
        status: session.status,
        expectedBytes: session.expectedBytes.toString(),
        receivedBytes: session.receivedBytes.toString(),
        chunkSizeBytes: session.chunkSizeBytes,
        expectedChunks: session.expectedChunks,
        receivedChunks: session.receivedChunks,
        uploadedChunkIndexes: chunks.map((chunk) => chunk.chunkIndex),
        expiresAt: session.expiresAt,
      },
      meta: { requestId: req.id },
    });
  }),
);

router.put(
  "/:uploadId/chunks/:chunkIndex",
  express.raw({
    type: "application/octet-stream",
    limit: MAX_CHUNK_BYTES,
  }),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const uploadId = routeIdSchema.parse(req.params.uploadId);
    const chunkIndex = chunkIndexSchema.parse(req.params.chunkIndex);
    const body = req.body;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new AppError(400, "EMPTY_CHUNK", "Chunk body is empty.");
    }

    const session = await prisma.uploadSession.findFirst({
      where: {
        id: uploadId,
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      },
    });

    if (!session || session.status !== "ACTIVE") {
      throw new AppError(
        404,
        "UPLOAD_NOT_ACTIVE",
        "Upload session is not active.",
      );
    }

    if (session.expiresAt <= new Date()) {
      throw new AppError(410, "UPLOAD_EXPIRED", "Upload session has expired.");
    }

    if (chunkIndex >= session.expectedChunks) {
      throw new AppError(
        400,
        "INVALID_CHUNK_INDEX",
        "Chunk index is outside the expected range.",
      );
    }

    const expectedChunkBytes =
      chunkIndex === session.expectedChunks - 1
        ? Number(
            session.expectedBytes -
              BigInt(session.chunkSizeBytes) *
                BigInt(session.expectedChunks - 1),
          )
        : session.chunkSizeBytes;

    if (body.length !== expectedChunkBytes) {
      throw new AppError(
        409,
        "CHUNK_SIZE_MISMATCH",
        "Chunk size does not match the upload session.",
      );
    }

    const existing = await prisma.uploadChunk.findUnique({
      where: {
        uploadSessionId_chunkIndex: {
          uploadSessionId: session.id,
          chunkIndex,
        },
      },
    });

    if (existing) {
      res.json({
        data: {
          accepted: true,
          duplicate: true,
          chunkIndex,
        },
        meta: { requestId: req.id },
      });
      return;
    }

    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    const chunkStorageKey = `${session.tempStorageKey}/chunk-${String(chunkIndex).padStart(8, "0")}`;

    await writeStorageFile(chunkStorageKey, body);

    try {
      await prisma.$transaction([
        prisma.uploadChunk.create({
          data: {
            uploadSessionId: session.id,
            chunkIndex,
            sizeBytes: body.length,
            checksumSha256,
            storageKey: chunkStorageKey,
          },
        }),
        prisma.uploadSession.update({
          where: { id: session.id },
          data: {
            receivedBytes: {
              increment: BigInt(body.length),
            },
            receivedChunks: { increment: 1 },
          },
        }),
      ]);
    } catch (error) {
      await removeStorageFile(chunkStorageKey);
      throw error;
    }

    res.status(201).json({
      data: {
        accepted: true,
        duplicate: false,
        chunkIndex,
        sizeBytes: body.length,
        checksumSha256,
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/:uploadId/complete",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const uploadId = routeIdSchema.parse(req.params.uploadId);

    const session = await prisma.uploadSession.findFirst({
      where: {
        id: uploadId,
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      },
    });

    if (!session || session.status !== "ACTIVE") {
      throw new AppError(
        404,
        "UPLOAD_NOT_ACTIVE",
        "Upload session is not active.",
      );
    }

    const mediaAsset = await prisma.mediaAsset.findFirst({
      where: {
        id: session.mediaAssetId,
        workspaceId: auth.workspaceId,
      },
    });

    if (!mediaAsset) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset was not found.");
    }

    const chunks = await prisma.uploadChunk.findMany({
      where: { uploadSessionId: session.id },
      orderBy: { chunkIndex: "asc" },
    });

    if (
      session.receivedChunks !== session.expectedChunks ||
      session.receivedBytes !== session.expectedBytes ||
      chunks.length !== session.expectedChunks
    ) {
      throw new AppError(
        409,
        "UPLOAD_INCOMPLETE",
        "Not all upload chunks have been received.",
      );
    }

    if (chunks.some((chunk, index) => chunk.chunkIndex !== index)) {
      throw new AppError(
        409,
        "UPLOAD_CHUNK_GAP",
        "One or more upload chunks are missing.",
      );
    }

    const claimed = await prisma.uploadSession.updateMany({
      where: {
        id: session.id,
        status: "ACTIVE",
      },
      data: { status: "COMPLETING" },
    });

    if (claimed.count !== 1) {
      throw new AppError(
        409,
        "UPLOAD_ALREADY_COMPLETING",
        "Upload completion is already in progress.",
      );
    }

    try {
      await concatenateStorageFiles(
        chunks.map((chunk) => chunk.storageKey),
        mediaAsset.storageKey,
      );

      const actualBytes = await storageFileSize(mediaAsset.storageKey);

      if (actualBytes !== session.expectedBytes) {
        throw new AppError(
          409,
          "UPLOAD_SIZE_MISMATCH",
          "Completed file size does not match.",
        );
      }

      const actualChecksum = await storageFileChecksum(mediaAsset.storageKey);

      if (
        mediaAsset.checksumSha256 &&
        actualChecksum !== mediaAsset.checksumSha256
      ) {
        throw new AppError(
          409,
          "UPLOAD_CHECKSUM_MISMATCH",
          "Completed file checksum does not match.",
        );
      }

      const detected = await inspectStoredMedia(mediaAsset.storageKey);

      if (!declaredTypeMatchesDetectedType(mediaAsset.contentType, detected)) {
        throw new AppError(
          415,
          "MEDIA_TYPE_MISMATCH",
          "Uploaded file content does not match its declared content type.",
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.mediaAsset.update({
          where: { id: mediaAsset.id },
          data: {
            status: "READY",
            checksumSha256: actualChecksum,
            detectedContentType: detected.contentType,
            detectedMediaType: detected.mediaType,
          },
        });

        await tx.uploadSession.update({
          where: { id: session.id },
          data: { status: "COMPLETED" },
        });

        await tx.$executeRaw`
          UPDATE "Workspace"
          SET
            "storageReservedBytes" = GREATEST(
              "storageReservedBytes" - ${session.expectedBytes},
              0
            ),
            "storageUsedBytes" = "storageUsedBytes" + ${session.expectedBytes}
          WHERE "id" = ${auth.workspaceId}
        `;

        await tx.quotaReservation.updateMany({
          where: {
            sourceId: session.id,
            status: "ACTIVE",
          },
          data: {
            status: "COMMITTED",
            committedAt: new Date(),
          },
        });

        await recordUsageInTransaction(tx, {
          workspaceId: auth.workspaceId,
          metric: "STORAGE_BYTES",
          quantity: session.expectedBytes,
          idempotencyKey: `upload:${session.id}:storage`,
          paygOperationKey: session.paygOperationKeyPrefix
            ? `${session.paygOperationKeyPrefix}:storage`
            : undefined,
          sourceType: "UPLOAD_SESSION",
          sourceId: session.id,
          metadata: { assetId: mediaAsset.id },
        });

        await recordUsageInTransaction(tx, {
          workspaceId: auth.workspaceId,
          metric: "UPLOAD_BYTES",
          quantity: session.expectedBytes,
          idempotencyKey: `upload:${session.id}:bytes`,
          paygOperationKey: session.paygOperationKeyPrefix
            ? `${session.paygOperationKeyPrefix}:upload`
            : undefined,
          sourceType: "UPLOAD_SESSION",
          sourceId: session.id,
          metadata: { assetId: mediaAsset.id },
        });

        await recordUsageInTransaction(tx, {
          workspaceId: auth.workspaceId,
          metric: "ACTIVE_ASSETS",
          quantity: 1n,
          idempotencyKey: `asset:${mediaAsset.id}:created`,
          sourceType: "MEDIA_ASSET",
          sourceId: mediaAsset.id,
        });

        await tx.auditLog.create({
          data: {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: "media.upload_completed",
            entityType: "MediaAsset",
            entityId: mediaAsset.id,
            metadata: {
              originalFilename: mediaAsset.originalFilename,
              sizeBytes: session.expectedBytes.toString(),
              uploadId: session.id,
            },
            ipAddress: req.ip,
          },
        });
      });

      scheduleUsageAlertEvaluation(auth.workspaceId);
      await invalidatePublicMediaCache(mediaAsset.id);

      const cleanupResults = await Promise.allSettled(
        chunks.map((chunk) => removeStorageFile(chunk.storageKey)),
      );

      const cleanupFailures = cleanupResults.filter(
        (result) => result.status === "rejected",
      ).length;

      if (cleanupFailures > 0) {
        req.log.warn(
          { uploadId: session.id, cleanupFailures },
          "upload completed but one or more temporary chunks could not be removed",
        );
      }

      const optimizationQueued =
        detected.mediaType === "IMAGE"
          ? enqueueImageOptimization(mediaAsset.id)
          : false;
      const optimization = imageOptimizationResponse(
        detected.mediaType,
        optimizationQueued,
      );
      const urls = buildMediaUrls({
        assetId: mediaAsset.id,
        visibility: mediaAsset.visibility,
        status: "READY",
        detectedMediaType: detected.mediaType,
        readyVariants: [],
      });

      res.json({
        data: {
          assetId: mediaAsset.id,
          status: "READY",
          visibility: mediaAsset.visibility,
          detectedContentType: detected.contentType,
          detectedMediaType: detected.mediaType,
          checksumSha256: actualChecksum,
          sizeBytes: actualBytes.toString(),
          optimization,
          ...urls,
        },
        meta: { requestId: req.id },
      });
    } catch (error) {
      await removeStorageFile(mediaAsset.storageKey);

      await prisma.uploadSession.updateMany({
        where: {
          id: session.id,
          status: "COMPLETING",
        },
        data: { status: "ACTIVE" },
      });

      throw error;
    }
  }),
);

router.delete(
  "/:uploadId",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const uploadId = routeIdSchema.parse(req.params.uploadId);

    const session = await prisma.uploadSession.findFirst({
      where: {
        id: uploadId,
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        status: "ACTIVE",
      },
    });

    if (!session) {
      throw new AppError(
        404,
        "UPLOAD_NOT_FOUND",
        "Upload session was not found.",
      );
    }

    const chunks = await prisma.uploadChunk.findMany({
      where: { uploadSessionId: session.id },
      select: { storageKey: true },
    });

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.uploadSession.updateMany({
        where: {
          id: session.id,
          status: "ACTIVE",
        },
        data: { status: "ABORTED" },
      });

      if (claimed.count !== 1) {
        throw new AppError(
          409,
          "UPLOAD_NOT_ACTIVE",
          "Upload session is not active.",
        );
      }

      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageReservedBytes" = GREATEST(
          "storageReservedBytes" - ${session.expectedBytes},
          0
        )
        WHERE "id" = ${auth.workspaceId}
      `;

      await tx.quotaReservation.updateMany({
        where: {
          sourceId: session.id,
          status: "ACTIVE",
        },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
        },
      });

      if (session.paygOperationKeyPrefix) {
        await tx.paygAuthorization.updateMany({
          where: {
            workspaceId: auth.workspaceId,
            operationKey: {
              startsWith: session.paygOperationKeyPrefix,
            },
            status: "ACTIVE",
          },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
          },
        });
      }

      await tx.mediaAsset.update({
        where: { id: session.mediaAssetId },
        data: {
          status: "FAILED",
          deletedAt: new Date(),
        },
      });
    });

    await Promise.all(
      chunks.map((chunk) => removeStorageFile(chunk.storageKey)),
    );

    res.status(204).send();
  }),
);

export default router;
