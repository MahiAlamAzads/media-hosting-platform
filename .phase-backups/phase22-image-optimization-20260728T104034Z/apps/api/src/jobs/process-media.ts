import { prisma } from "@media/database";
import { ImageProcessor } from "../modules/processing/image-processor.js";

async function main(): Promise<void> {
  const processor = new ImageProcessor();

  const assets = await prisma.mediaAsset.findMany({
    where: {
      detectedMediaType: "IMAGE",
      status: "READY",
      deletedAt: null,
      variants: {
        none: {}
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    take: 25,
    select: {
      id: true
    }
  });

  let processed = 0;
  let failed = 0;

  for (const asset of assets) {
    try {
      await processor.process(asset.id);
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `Failed to process ${asset.id}:`,
        error
      );

      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { status: "READY" }
      }).catch(() => undefined);
    }
  }

  console.log(
    `Media processing complete. processed=${processed} failed=${failed}`
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
