import { prisma } from "@media/database";
import { ImageProcessor } from "../modules/processing/image-processor.js";
import { findPendingImageAssetIds } from "../modules/processing/image-optimization-scheduler.js";

async function main(): Promise<void> {
  const processor = new ImageProcessor();
  const assetIds = await findPendingImageAssetIds(25);
  let processed = 0;
  let failed = 0;

  for (const assetId of assetIds) {
    try {
      await processor.process(assetId);
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to process ${assetId}:`, error);

      await prisma.mediaAsset
        .updateMany({
          where: { id: assetId, status: "PROCESSING" },
          data: { status: "READY" },
        })
        .catch(() => undefined);
    }
  }

  console.log(
    `Media processing complete. processed=${processed} failed=${failed}`,
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
