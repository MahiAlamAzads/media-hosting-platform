import { prisma } from "@media/database";

async function main(): Promise<void> {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true },
  });

  let corrected = 0;

  for (const workspace of workspaces) {
    const [originals, variants, reservations] = await prisma.$transaction([
      prisma.mediaAsset.aggregate({
        where: {
          workspaceId: workspace.id,
          status: { in: ["READY", "PROCESSING", "DELETED"] },
        },
        _sum: { sizeBytes: true },
      }),
      prisma.mediaVariant.aggregate({
        where: {
          mediaAsset: { workspaceId: workspace.id },
          status: "READY",
        },
        _sum: { sizeBytes: true },
      }),
      prisma.quotaReservation.aggregate({
        where: {
          workspaceId: workspace.id,
          metric: "STORAGE_BYTES",
          status: "ACTIVE",
        },
        _sum: { quantity: true },
      }),
    ]);

    const used =
      (originals._sum.sizeBytes ?? 0n) + (variants._sum.sizeBytes ?? 0n);
    const reserved = reservations._sum.quantity ?? 0n;

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        storageUsedBytes: used,
        storageReservedBytes: reserved,
      },
    });

    corrected += 1;
  }

  console.log(`Usage reconciliation complete. workspaces=${corrected}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
