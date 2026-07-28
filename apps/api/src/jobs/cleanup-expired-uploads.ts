import "dotenv/config";
import { prisma } from "@media/database";
import { removeStorageFile } from "../infrastructure/storage.js";

async function cleanupOne(uploadId: string): Promise<boolean> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadId }
  });

  if (
    !session ||
    session.status !== "ACTIVE" ||
    session.expiresAt > new Date()
  ) {
    return false;
  }

  const claimed = await prisma.uploadSession.updateMany({
    where: {
      id: session.id,
      status: "ACTIVE",
      expiresAt: { lte: new Date() }
    },
    data: { status: "EXPIRED" }
  });

  if (claimed.count !== 1) return false;

  const chunks = await prisma.uploadChunk.findMany({
    where: { uploadSessionId: session.id },
    select: { storageKey: true }
  });

  await prisma.$transaction(async tx => {
    const storage = await tx.quotaReservation.aggregate({
      where: {
        sourceId: session.id,
        workspaceId: session.workspaceId,
        metric: "STORAGE_BYTES",
        status: "ACTIVE"
      },
      _sum: { quantity: true }
    });

    const bytes = storage._sum.quantity ?? 0n;

    if (bytes > 0n) {
      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageReservedBytes" = GREATEST(
          "storageReservedBytes" - ${bytes},
          0
        )
        WHERE "id" = ${session.workspaceId}
      `;
    }

    await tx.quotaReservation.updateMany({
      where: {
        sourceId: session.id,
        workspaceId: session.workspaceId,
        status: "ACTIVE"
      },
      data: {
        status: "EXPIRED",
        releasedAt: new Date()
      }
    });

    if (session.paygOperationKeyPrefix) {
      await tx.paygAuthorization.updateMany({
        where: {
          workspaceId: session.workspaceId,
          operationKey: {
            startsWith: session.paygOperationKeyPrefix
          },
          status: "ACTIVE"
        },
        data: {
          status: "EXPIRED",
          releasedAt: new Date()
        }
      });
    }

    await tx.mediaAsset.updateMany({
      where: {
        id: session.mediaAssetId,
        status: { in: ["UPLOADING", "PROCESSING"] }
      },
      data: {
        status: "FAILED",
        deletedAt: new Date()
      }
    });
  });

  await Promise.allSettled(
    chunks.map(chunk => removeStorageFile(chunk.storageKey))
  );

  return true;
}

async function main(): Promise<void> {
  const expired = await prisma.uploadSession.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: new Date() }
    },
    orderBy: { expiresAt: "asc" },
    take: 100,
    select: { id: true }
  });

  let cleaned = 0;

  for (const item of expired) {
    if (await cleanupOne(item.id)) cleaned += 1;
  }

  console.log(`Expired uploads cleaned: ${cleaned}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
