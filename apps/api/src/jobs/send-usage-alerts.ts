import { prisma } from "@media/database";
import { evaluateUsageAlertsForAllWorkspaces } from "../modules/billing/usage-alert.service.js";

async function main(): Promise<void> {
  const result = await evaluateUsageAlertsForAllWorkspaces();

  console.log(
    [
      `Workspaces evaluated: ${result.workspaces}`,
      `Alerts created: ${result.created}`,
      `Emails sent: ${result.emailed}`,
      `Email failures: ${result.failed}`,
    ].join("\n"),
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
