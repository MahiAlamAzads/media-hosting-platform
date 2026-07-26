import "dotenv/config";
import { prisma } from "@media/database";
import { removeStorageFile } from "../infrastructure/storage.js";

async function cleanupOne(uploadId: string): Promise<boolean> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadId }
  });

  if (!session || session.status !== "ACTIVE" || session.expiresAt > new Date()) {
    return false;
  }

  const claimed = await prisma.uploadSession.updateMany({
    where: {
      id: session.id,
      status: "ACTIVE",
      expiresAt: { lte: new Date() }
    },
    data: {
      status: "EXPIRED"
    }
  });

  if (claimed.count !== 1) return false;

  const chunks = await prisma.uploadChunk.findMany({
    where: { uploadSessionId: session.id },
    select: { storageKey: true }
  });

  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: session.workspaceId },
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
