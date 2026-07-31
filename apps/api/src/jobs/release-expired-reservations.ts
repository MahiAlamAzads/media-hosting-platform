import { prisma } from "@media/database";
import { removeStorageFile } from "../infrastructure/storage.js";

async function releaseReservationRows(input: {
  sourceId: string;
  workspaceId: string;
  status: "RELEASED" | "EXPIRED";
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const storage = await tx.quotaReservation.aggregate({
      where: {
        sourceId: input.sourceId,
        workspaceId: input.workspaceId,
        metric: "STORAGE_BYTES",
        status: "ACTIVE",
      },
      _sum: { quantity: true },
    });

    const bytes = storage._sum.quantity ?? 0n;

    if (bytes > 0n) {
      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageReservedBytes" = GREATEST(
          "storageReservedBytes" - ${bytes},
          0
        )
        WHERE "id" = ${input.workspaceId}
      `;
    }

    await tx.quotaReservation.updateMany({
      where: {
        sourceId: input.sourceId,
        workspaceId: input.workspaceId,
        status: "ACTIVE",
      },
      data: {
        status: input.status,
        releasedAt: new Date(),
      },
    });
  });
}

async function releaseUpload(sourceId: string): Promise<boolean> {
  const reservation = await prisma.quotaReservation.findFirst({
    where: { sourceId, status: "ACTIVE" },
    select: { workspaceId: true },
  });

  if (!reservation) return false;

  const session = await prisma.uploadSession.findUnique({
    where: { id: sourceId },
  });

  if (!session) {
    await releaseReservationRows({
      sourceId,
      workspaceId: reservation.workspaceId,
      status: "EXPIRED",
    });
    return true;
  }

  if (!["ACTIVE", "COMPLETING"].includes(session.status)) {
    await releaseReservationRows({
      sourceId,
      workspaceId: session.workspaceId,
      status: session.status === "EXPIRED" ? "EXPIRED" : "RELEASED",
    });
    return true;
  }

  const chunks = await prisma.uploadChunk.findMany({
    where: { uploadSessionId: session.id },
    select: { storageKey: true },
  });

  const claimed = await prisma.uploadSession.updateMany({
    where: {
      id: session.id,
      status: { in: ["ACTIVE", "COMPLETING"] },
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  if (claimed.count !== 1) return false;

  await releaseReservationRows({
    sourceId,
    workspaceId: session.workspaceId,
    status: "EXPIRED",
  });

  await prisma.mediaAsset.updateMany({
    where: {
      id: session.mediaAssetId,
      status: { in: ["UPLOADING", "PROCESSING"] },
    },
    data: {
      status: "FAILED",
      deletedAt: new Date(),
    },
  });

  await Promise.allSettled(
    chunks.map((chunk) => removeStorageFile(chunk.storageKey)),
  );

  return true;
}

async function main(): Promise<void> {
  const expired = await prisma.quotaReservation.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: new Date() },
    },
    distinct: ["sourceId"],
    orderBy: { expiresAt: "asc" },
    take: 200,
    select: { sourceId: true },
  });

  let released = 0;

  for (const item of expired) {
    if (await releaseUpload(item.sourceId)) released += 1;
  }

  console.log(`Expired quota reservations released: ${released}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
