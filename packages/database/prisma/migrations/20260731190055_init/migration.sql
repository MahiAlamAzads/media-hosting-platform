-- AlterTable
ALTER TABLE "EnterpriseInquiry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PlanOffer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PrepaidWallet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "UsageAlert_workspaceId_metric_threshold_periodStart_periodEnd_k" RENAME TO "UsageAlert_workspaceId_metric_threshold_periodStart_periodE_key";
