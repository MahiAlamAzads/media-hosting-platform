import "dotenv/config";
import { prisma } from "@media/database";
import { chargePendingPayg } from "../modules/billing/payg-charge.service.js";
import { releaseExpiredPaygAuthorizations } from "../modules/billing/payg.service.js";

async function main(): Promise<void> {
  const released = await releaseExpiredPaygAuthorizations();
  const result = await chargePendingPayg(false);

  console.log(
    `PAYG policies checked: ${result.checked}; ` +
      `charges completed: ${result.charged}; ` +
      `expired authorizations released: ${released}`,
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
