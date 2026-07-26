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
  writeStorageFile
} from "../../infrastructure/storage.js";
import { AppError, asyncHandler } from "../../shared/http.js";

const router = Router();
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024 * 1024;

const routeIdSchema = z.string().cuid();
const chunkIndexSchema = z.coerce.number().int().nonnegative();

const initSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(150),
  sizeBytes: z.coerce.number().int().positive().max(MAX_FILE_BYTES),
  folderId: z.string().cuid().nullable().optional(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional()
});

function mediaTypeFromContentType(contentType: string) {
  if (contentType.startsWith("image/")) return "IMAGE" as const;
  if (contentType.startsWith("video/")) return "VIDEO" as const;
  if (contentType.startsWith("audio/")) return "AUDIO" as const;

  if (
    contentType === "application/pdf" ||
    contentType.startsWith("text/")
  ) {
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

router.post("/", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const input = initSchema.parse(req.body);
  const expectedBytes = BigInt(input.sizeBytes);

  if (input.folderId) {
    const folder = await prisma.folder.findFirst({
      where: {
        id: input.folderId,
        workspaceId: auth.workspaceId
      },
      select: { id: true }
    });

    if (!folder) {
      throw new AppError(404, "FOLDER_NOT_FOUND", "Folder was not found.");
    }
  }

  const duplicate = input.checksumSha256
    ? await prisma.mediaAsset.findFirst({
        where: {
          workspaceId: auth.workspaceId,
          checksumSha256: input.checksumSha256.toLowerCase(),
          status: "READY",
          deletedAt: null
        },
        select: {
          id: true,
          originalFilename: true,
          sizeBytes: true
        }
      })
    : null;

  if (duplicate) {
    res.status(409).json({
      error: {
        code: "DUPLICATE_MEDIA",
        message: "An identical media asset already exists.",
        existingAsset: {
          ...duplicate,
          sizeBytes: duplicate.sizeBytes.toString()
        },
        requestId: req.id
      }
    });
    return;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: {
      storageLimitBytes: true,
      storageUsedBytes: true,
      storageReservedBytes: true
    }
  });

  if (!workspace) {
    throw new AppError(
      404,
      "WORKSPACE_NOT_FOUND",
      "Workspace was not found."
    );
  }

  if (
    workspace.storageUsedBytes +
      workspace.storageReservedBytes +
      expectedBytes >
    workspace.storageLimitBytes
  ) {
    throw new AppError(
      413,
      "STORAGE_QUOTA_EXCEEDED",
      "Workspace storage quota exceeded."
    );
  }

  await ensureWorkspaceStorage(auth.workspaceId);

  const chunkSizeBytes = DEFAULT_CHUNK_BYTES;
  const expectedChunks = Math.ceil(input.sizeBytes / chunkSizeBytes);

  const result = await prisma.$transaction(async tx => {
    const asset = await tx.mediaAsset.create({
      data: {
        workspaceId: auth.workspaceId,
        folderId: input.folderId ?? null,
        createdById: auth.userId,
        originalFilename: input.filename,
        storageKey: `tenants/${auth.workspaceId}/originals/pending-${Date.now()}`,
        contentType: input.contentType,
        detectedMediaType: mediaTypeFromContentType(input.contentType),
        sizeBytes: expectedBytes,
        checksumSha256: input.checksumSha256?.toLowerCase(),
        status: "UPLOADING"
      }
    });

    const finalStorageKey =
      `tenants/${auth.workspaceId}/originals/${asset.id}/${safeFilename(input.filename)}`;

    await tx.mediaAsset.update({
      where: { id: asset.id },
      data: { storageKey: finalStorageKey }
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
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    await tx.workspace.update({
      where: { id: auth.workspaceId },
      data: {
        storageReservedBytes: {
          increment: expectedBytes
        }
      }
    });

    return {
      assetId: asset.id,
      uploadId: session.id,
      expiresAt: session.expiresAt
    };
  });

  res.status(201).json({
    data: {
      uploadId: result.uploadId,
      assetId: result.assetId,
      chunkSizeBytes,
      expectedChunks,
      expiresAt: result.expiresAt
    },
    meta: { requestId: req.id }
  });
}));

router.get("/:uploadId", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const uploadId = routeIdSchema.parse(req.params.uploadId);

  const session = await prisma.uploadSession.findFirst({
    where: {
      id: uploadId,
      workspaceId: auth.workspaceId,
      userId: auth.userId
    }
  });

  if (!session) {
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Upload session was not found."
    );
  }

  const chunks = await prisma.uploadChunk.findMany({
    where: {
      uploadSessionId: session.id
    },
    orderBy: {
      chunkIndex: "asc"
    },
    select: {
      chunkIndex: true,
      sizeBytes: true
    }
  });

  res.json({
    data: {
      id: session.id,
      status: session.status,
      expectedBytes: session.expectedBytes.toString(),
      receivedBytes: session.receivedBytes.toString(),
      expectedChunks: session.expectedChunks,
      receivedChunks: session.receivedChunks,
      uploadedChunkIndexes: chunks.map(chunk => chunk.chunkIndex),
      expiresAt: session.expiresAt
    },
    meta: { requestId: req.id }
  });
}));

router.put(
  "/:uploadId/chunks/:chunkIndex",
  express.raw({
    type: "application/octet-stream",
    limit: MAX_CHUNK_BYTES
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
        userId: auth.userId
      }
    });

    if (!session || session.status !== "ACTIVE") {
      throw new AppError(
        404,
        "UPLOAD_NOT_ACTIVE",
        "Upload session is not active."
      );
    }

    if (session.expiresAt <= new Date()) {
      throw new AppError(
        410,
        "UPLOAD_EXPIRED",
        "Upload session has expired."
      );
    }

    if (chunkIndex >= session.expectedChunks) {
      throw new AppError(
        400,
        "INVALID_CHUNK_INDEX",
        "Chunk index is outside the expected range."
      );
    }

    const existing = await prisma.uploadChunk.findUnique({
      where: {
        uploadSessionId_chunkIndex: {
          uploadSessionId: session.id,
          chunkIndex
        }
      }
    });

    if (existing) {
      res.json({
        data: {
          accepted: true,
          duplicate: true,
          chunkIndex
        },
        meta: { requestId: req.id }
      });
      return;
    }

    const checksumSha256 = createHash("sha256")
      .update(body)
      .digest("hex");

    const chunkStorageKey =
      `${session.tempStorageKey}/chunk-${String(chunkIndex).padStart(8, "0")}`;

    await writeStorageFile(chunkStorageKey, body);

    try {
      await prisma.$transaction([
        prisma.uploadChunk.create({
          data: {
            uploadSessionId: session.id,
            chunkIndex,
            sizeBytes: body.length,
            checksumSha256,
            storageKey: chunkStorageKey
          }
        }),
        prisma.uploadSession.update({
          where: { id: session.id },
          data: {
            receivedBytes: { increment: BigInt(body.length) },
            receivedChunks: { increment: 1 }
          }
        })
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
        checksumSha256
      },
      meta: { requestId: req.id }
    });
  })
);

router.post("/:uploadId/complete", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const uploadId = routeIdSchema.parse(req.params.uploadId);

  const session = await prisma.uploadSession.findFirst({
    where: {
      id: uploadId,
      workspaceId: auth.workspaceId,
      userId: auth.userId
    }
  });

  if (!session || session.status !== "ACTIVE") {
    throw new AppError(
      404,
      "UPLOAD_NOT_ACTIVE",
      "Upload session is not active."
    );
  }

  const mediaAsset = await prisma.mediaAsset.findFirst({
    where: {
      id: session.mediaAssetId,
      workspaceId: auth.workspaceId
    }
  });

  if (!mediaAsset) {
    throw new AppError(
      404,
      "MEDIA_NOT_FOUND",
      "Media asset was not found."
    );
  }

  const chunks = await prisma.uploadChunk.findMany({
    where: {
      uploadSessionId: session.id
    },
    orderBy: {
      chunkIndex: "asc"
    }
  });

  if (
    session.receivedChunks !== session.expectedChunks ||
    session.receivedBytes !== session.expectedBytes ||
    chunks.length !== session.expectedChunks
  ) {
    throw new AppError(
      409,
      "UPLOAD_INCOMPLETE",
      "Not all upload chunks have been received."
    );
  }

  const hasGap = chunks.some(
    (chunk, index) => chunk.chunkIndex !== index
  );

  if (hasGap) {
    throw new AppError(
      409,
      "UPLOAD_CHUNK_GAP",
      "One or more upload chunks are missing."
    );
  }

  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: "COMPLETING" }
  });

  try {
    await concatenateStorageFiles(
      chunks.map(chunk => chunk.storageKey),
      mediaAsset.storageKey
    );

    const actualBytes = await storageFileSize(mediaAsset.storageKey);

    if (actualBytes !== session.expectedBytes) {
      throw new AppError(
        409,
        "UPLOAD_SIZE_MISMATCH",
        "Completed file size does not match."
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
        "Completed file checksum does not match."
      );
    }

    await prisma.$transaction([
      prisma.mediaAsset.update({
        where: { id: mediaAsset.id },
        data: {
          status: "READY",
          checksumSha256: actualChecksum
        }
      }),
      prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED" }
      }),
      prisma.workspace.update({
        where: { id: auth.workspaceId },
        data: {
          storageReservedBytes: {
            decrement: session.expectedBytes
          },
          storageUsedBytes: {
            increment: session.expectedBytes
          }
        }
      })
    ]);

    await Promise.all(
      chunks.map(chunk => removeStorageFile(chunk.storageKey))
    );

    res.json({
      data: {
        assetId: mediaAsset.id,
        status: "READY",
        checksumSha256: actualChecksum,
        sizeBytes: actualBytes.toString()
      },
      meta: { requestId: req.id }
    });
  } catch (error) {
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "ACTIVE" }
    });

    throw error;
  }
}));

router.delete("/:uploadId", asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const uploadId = routeIdSchema.parse(req.params.uploadId);

  const session = await prisma.uploadSession.findFirst({
    where: {
      id: uploadId,
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      status: {
        in: ["ACTIVE", "COMPLETING"]
      }
    }
  });

  if (!session) {
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Upload session was not found."
    );
  }

  const chunks = await prisma.uploadChunk.findMany({
    where: {
      uploadSessionId: session.id
    },
    select: {
      storageKey: true
    }
  });

  await prisma.$transaction([
    prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "ABORTED" }
    }),
    prisma.workspace.update({
      where: { id: auth.workspaceId },
      data: {
        storageReservedBytes: {
          decrement: session.expectedBytes
        }
      }
    }),
    prisma.mediaAsset.update({
      where: { id: session.mediaAssetId },
      data: {
        status: "FAILED",
        deletedAt: new Date()
      }
    })
  ]);

  await Promise.all(
    chunks.map(chunk => removeStorageFile(chunk.storageKey))
  );

  res.status(204).send();
}));

export default router;
