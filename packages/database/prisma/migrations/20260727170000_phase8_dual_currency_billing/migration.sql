CREATE TYPE "BillingCurrency" AS ENUM ('BDT', 'USD');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "UsageMetric" AS ENUM (
  'STORAGE_BYTES',
  'DELIVERY_BYTES',
  'UPLOAD_BYTES',
  'API_REQUESTS',
  'IMAGE_TRANSFORMATIONS',
  'VIDEO_PROCESSING_SECONDS',
  'PROCESSING_CPU_MILLISECONDS',
  'ACTIVE_ASSETS',
  'FOLDERS',
  'WORKSPACE_MEMBERS',
  'API_KEYS',
  'CONCURRENT_JOBS',
  'MAX_FILE_SIZE_BYTES'
);
CREATE TYPE "QuotaReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED');
CREATE TYPE "SubscriptionChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'APPLIED', 'REJECTED', 'CANCELLED');

ALTER TABLE "Workspace"
ALTER COLUMN "storageLimitBytes" SET DEFAULT 2147483648;

CREATE TABLE "Plan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanVersion" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanPrice" (
  "id" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanEntitlement" (
  "id" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "includedAmount" BIGINT NOT NULL,
  "hardLimit" BOOLEAN NOT NULL DEFAULT true,
  "overageAllowed" BOOLEAN NOT NULL DEFAULT false,
  "overageUnit" BIGINT,
  "overageBdtMinor" BIGINT,
  "overageUsdMinor" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceSubscription" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currency" "BillingCurrency" NOT NULL DEFAULT 'BDT',
  "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "trialEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "graceEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingPreference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "preferredCurrency" "BillingCurrency" NOT NULL DEFAULT 'BDT',
  "preferredInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
  "billingEmail" TEXT,
  "countryCode" TEXT,
  "taxId" TEXT,
  "companyName" TEXT,
  "billingAddress" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "quantity" BIGINT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageAggregate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "quantity" BIGINT NOT NULL DEFAULT 0,
  "lastEventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageAggregate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotaReservation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "quantity" BIGINT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" "QuotaReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "committedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuotaReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageAlert" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "threshold" INTEGER NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionChange" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedPlanVersionId" TEXT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "status" "SubscriptionChangeStatus" NOT NULL DEFAULT 'PENDING',
  "effectiveAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE UNIQUE INDEX "PlanVersion_planId_version_key" ON "PlanVersion"("planId", "version");
CREATE INDEX "PlanVersion_planId_publishedAt_retiredAt_idx" ON "PlanVersion"("planId", "publishedAt", "retiredAt");
CREATE UNIQUE INDEX "PlanPrice_planVersionId_currency_interval_key" ON "PlanPrice"("planVersionId", "currency", "interval");
CREATE INDEX "PlanPrice_currency_interval_isActive_idx" ON "PlanPrice"("currency", "interval", "isActive");
CREATE UNIQUE INDEX "PlanEntitlement_planVersionId_metric_key" ON "PlanEntitlement"("planVersionId", "metric");
CREATE INDEX "PlanEntitlement_metric_idx" ON "PlanEntitlement"("metric");
CREATE UNIQUE INDEX "WorkspaceSubscription_workspaceId_key" ON "WorkspaceSubscription"("workspaceId");
CREATE INDEX "WorkspaceSubscription_planVersionId_status_idx" ON "WorkspaceSubscription"("planVersionId", "status");
CREATE INDEX "WorkspaceSubscription_periodEnd_status_idx" ON "WorkspaceSubscription"("periodEnd", "status");
CREATE UNIQUE INDEX "BillingPreference_workspaceId_key" ON "BillingPreference"("workspaceId");
CREATE UNIQUE INDEX "UsageEvent_idempotencyKey_key" ON "UsageEvent"("idempotencyKey");
CREATE INDEX "UsageEvent_workspaceId_metric_occurredAt_idx" ON "UsageEvent"("workspaceId", "metric", "occurredAt");
CREATE INDEX "UsageEvent_sourceType_sourceId_idx" ON "UsageEvent"("sourceType", "sourceId");
CREATE UNIQUE INDEX "UsageAggregate_workspaceId_metric_periodStart_periodEnd_key" ON "UsageAggregate"("workspaceId", "metric", "periodStart", "periodEnd");
CREATE INDEX "UsageAggregate_workspaceId_periodStart_periodEnd_idx" ON "UsageAggregate"("workspaceId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "QuotaReservation_sourceId_metric_key" ON "QuotaReservation"("sourceId", "metric");
CREATE INDEX "QuotaReservation_workspaceId_metric_status_idx" ON "QuotaReservation"("workspaceId", "metric", "status");
CREATE INDEX "QuotaReservation_expiresAt_status_idx" ON "QuotaReservation"("expiresAt", "status");
CREATE UNIQUE INDEX "UsageAlert_workspaceId_metric_threshold_periodStart_periodEnd_key" ON "UsageAlert"("workspaceId", "metric", "threshold", "periodStart", "periodEnd");
CREATE INDEX "UsageAlert_workspaceId_acknowledgedAt_triggeredAt_idx" ON "UsageAlert"("workspaceId", "acknowledgedAt", "triggeredAt");
CREATE INDEX "SubscriptionChange_workspaceId_status_createdAt_idx" ON "SubscriptionChange"("workspaceId", "status", "createdAt");
CREATE INDEX "SubscriptionChange_requestedPlanVersionId_status_idx" ON "SubscriptionChange"("requestedPlanVersionId", "status");

ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanEntitlement" ADD CONSTRAINT "PlanEntitlement_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingPreference" ADD CONSTRAINT "BillingPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageAggregate" ADD CONSTRAINT "UsageAggregate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotaReservation" ADD CONSTRAINT "QuotaReservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageAlert" ADD CONSTRAINT "UsageAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_requestedPlanVersionId_fkey" FOREIGN KEY ("requestedPlanVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reconcile pre-Phase-8 workspace counters so original and generated
-- variant bytes begin from one authoritative storage baseline.
UPDATE "Workspace" AS workspace
SET
  "storageUsedBytes" =
    COALESCE((
      SELECT SUM(asset."sizeBytes")
      FROM "MediaAsset" AS asset
      WHERE asset."workspaceId" = workspace."id"
        AND asset."status" IN ('READY', 'PROCESSING', 'DELETED')
    ), 0) +
    COALESCE((
      SELECT SUM(variant."sizeBytes")
      FROM "MediaVariant" AS variant
      INNER JOIN "MediaAsset" AS asset
        ON asset."id" = variant."mediaAssetId"
      WHERE asset."workspaceId" = workspace."id"
        AND variant."status" = 'READY'
    ), 0),
  "storageReservedBytes" = COALESCE((
    SELECT SUM(session."expectedBytes")
    FROM "UploadSession" AS session
    WHERE session."workspaceId" = workspace."id"
      AND session."status" IN ('ACTIVE', 'COMPLETING')
  ), 0);

INSERT INTO "Plan" ("id", "code", "name", "description", "isPublic", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
('plan_free', 'FREE', 'Free', 'For testing and small personal libraries.', true, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('plan_starter', 'STARTER', 'Starter', 'For individual creators and small integrations.', true, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('plan_pro', 'PRO', 'Pro', 'For growing products with higher delivery and processing usage.', true, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('plan_business', 'BUSINESS', 'Business', 'For production teams that need larger limits and operational support.', true, true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PlanVersion" ("id", "planId", "version", "effectiveAt", "publishedAt", "createdAt", "updatedAt") VALUES
('planv_free_v1', 'plan_free', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('planv_starter_v1', 'plan_starter', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('planv_pro_v1', 'plan_pro', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('planv_business_v1', 'plan_business', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PlanPrice" ("id", "planVersionId", "currency", "interval", "amountMinor", "isActive", "createdAt", "updatedAt") VALUES
('price_free_bdt_monthly', 'planv_free_v1', 'BDT', 'MONTHLY', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_free_bdt_yearly', 'planv_free_v1', 'BDT', 'YEARLY', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_free_usd_monthly', 'planv_free_v1', 'USD', 'MONTHLY', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_free_usd_yearly', 'planv_free_v1', 'USD', 'YEARLY', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_starter_bdt_monthly', 'planv_starter_v1', 'BDT', 'MONTHLY', 99000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_starter_bdt_yearly', 'planv_starter_v1', 'BDT', 'YEARLY', 990000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_starter_usd_monthly', 'planv_starter_v1', 'USD', 'MONTHLY', 900, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_starter_usd_yearly', 'planv_starter_v1', 'USD', 'YEARLY', 9000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_pro_bdt_monthly', 'planv_pro_v1', 'BDT', 'MONTHLY', 299000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_pro_bdt_yearly', 'planv_pro_v1', 'BDT', 'YEARLY', 2990000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_pro_usd_monthly', 'planv_pro_v1', 'USD', 'MONTHLY', 2900, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_pro_usd_yearly', 'planv_pro_v1', 'USD', 'YEARLY', 29000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_business_bdt_monthly', 'planv_business_v1', 'BDT', 'MONTHLY', 990000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_business_bdt_yearly', 'planv_business_v1', 'BDT', 'YEARLY', 9900000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_business_usd_monthly', 'planv_business_v1', 'USD', 'MONTHLY', 9900, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_business_usd_yearly', 'planv_business_v1', 'USD', 'YEARLY', 99000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PlanEntitlement" ("id", "planVersionId", "metric", "includedAmount", "hardLimit", "overageAllowed", "overageUnit", "overageBdtMinor", "overageUsdMinor", "createdAt", "updatedAt") VALUES
-- Free
('ent_free_storage', 'planv_free_v1', 'STORAGE_BYTES', 2147483648, true, false, 1073741824, 500, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_delivery', 'planv_free_v1', 'DELIVERY_BYTES', 5368709120, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_upload', 'planv_free_v1', 'UPLOAD_BYTES', 5368709120, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_api', 'planv_free_v1', 'API_REQUESTS', 25000, true, false, 100000, 6000, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_transform', 'planv_free_v1', 'IMAGE_TRANSFORMATIONS', 1000, true, false, 1000, 7500, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_video', 'planv_free_v1', 'VIDEO_PROCESSING_SECONDS', 0, true, false, 60, 600, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_cpu', 'planv_free_v1', 'PROCESSING_CPU_MILLISECONDS', 3600000, true, false, 3600000, 1800, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_assets', 'planv_free_v1', 'ACTIVE_ASSETS', 1000, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_folders', 'planv_free_v1', 'FOLDERS', 25, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_members', 'planv_free_v1', 'WORKSPACE_MEMBERS', 1, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_keys', 'planv_free_v1', 'API_KEYS', 1, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_jobs', 'planv_free_v1', 'CONCURRENT_JOBS', 1, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_free_file', 'planv_free_v1', 'MAX_FILE_SIZE_BYTES', 26214400, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Starter
('ent_starter_storage', 'planv_starter_v1', 'STORAGE_BYTES', 53687091200, true, false, 1073741824, 500, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_delivery', 'planv_starter_v1', 'DELIVERY_BYTES', 107374182400, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_upload', 'planv_starter_v1', 'UPLOAD_BYTES', 107374182400, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_api', 'planv_starter_v1', 'API_REQUESTS', 250000, true, false, 100000, 6000, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_transform', 'planv_starter_v1', 'IMAGE_TRANSFORMATIONS', 10000, true, false, 1000, 7500, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_video', 'planv_starter_v1', 'VIDEO_PROCESSING_SECONDS', 3600, true, false, 60, 600, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_cpu', 'planv_starter_v1', 'PROCESSING_CPU_MILLISECONDS', 36000000, true, false, 3600000, 1800, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_assets', 'planv_starter_v1', 'ACTIVE_ASSETS', 25000, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_folders', 'planv_starter_v1', 'FOLDERS', 500, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_members', 'planv_starter_v1', 'WORKSPACE_MEMBERS', 3, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_keys', 'planv_starter_v1', 'API_KEYS', 5, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_jobs', 'planv_starter_v1', 'CONCURRENT_JOBS', 2, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_starter_file', 'planv_starter_v1', 'MAX_FILE_SIZE_BYTES', 524288000, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Pro
('ent_pro_storage', 'planv_pro_v1', 'STORAGE_BYTES', 268435456000, true, false, 1073741824, 500, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_delivery', 'planv_pro_v1', 'DELIVERY_BYTES', 536870912000, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_upload', 'planv_pro_v1', 'UPLOAD_BYTES', 536870912000, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_api', 'planv_pro_v1', 'API_REQUESTS', 2000000, true, false, 100000, 6000, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_transform', 'planv_pro_v1', 'IMAGE_TRANSFORMATIONS', 75000, true, false, 1000, 7500, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_video', 'planv_pro_v1', 'VIDEO_PROCESSING_SECONDS', 30000, true, false, 60, 600, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_cpu', 'planv_pro_v1', 'PROCESSING_CPU_MILLISECONDS', 360000000, true, false, 3600000, 1800, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_assets', 'planv_pro_v1', 'ACTIVE_ASSETS', 250000, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_folders', 'planv_pro_v1', 'FOLDERS', 5000, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_members', 'planv_pro_v1', 'WORKSPACE_MEMBERS', 10, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_keys', 'planv_pro_v1', 'API_KEYS', 20, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_jobs', 'planv_pro_v1', 'CONCURRENT_JOBS', 5, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_pro_file', 'planv_pro_v1', 'MAX_FILE_SIZE_BYTES', 2147483648, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Business
('ent_business_storage', 'planv_business_v1', 'STORAGE_BYTES', 1099511627776, true, false, 1073741824, 500, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_delivery', 'planv_business_v1', 'DELIVERY_BYTES', 2199023255552, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_upload', 'planv_business_v1', 'UPLOAD_BYTES', 2199023255552, true, false, 1073741824, 1000, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_api', 'planv_business_v1', 'API_REQUESTS', 10000000, true, false, 100000, 6000, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_transform', 'planv_business_v1', 'IMAGE_TRANSFORMATIONS', 300000, true, false, 1000, 7500, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_video', 'planv_business_v1', 'VIDEO_PROCESSING_SECONDS', 180000, true, false, 60, 600, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_cpu', 'planv_business_v1', 'PROCESSING_CPU_MILLISECONDS', 1800000000, true, false, 3600000, 1800, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_assets', 'planv_business_v1', 'ACTIVE_ASSETS', 1000000, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_folders', 'planv_business_v1', 'FOLDERS', 25000, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_members', 'planv_business_v1', 'WORKSPACE_MEMBERS', 50, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_keys', 'planv_business_v1', 'API_KEYS', 100, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_jobs', 'planv_business_v1', 'CONCURRENT_JOBS', 15, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ent_business_file', 'planv_business_v1', 'MAX_FILE_SIZE_BYTES', 10737418240, true, false, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "BillingPreference" ("id", "workspaceId", "preferredCurrency", "preferredInterval", "createdAt", "updatedAt")
SELECT 'phase8_pref_' || "id", "id", 'BDT', 'MONTHLY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId") DO NOTHING;

INSERT INTO "WorkspaceSubscription" (
  "id", "workspaceId", "planVersionId", "status", "currency", "interval",
  "periodStart", "periodEnd", "createdAt", "updatedAt"
)
SELECT
  'phase8_sub_' || "id",
  "id",
  'planv_free_v1',
  'ACTIVE',
  'BDT',
  'MONTHLY',
  date_trunc('month', CURRENT_TIMESTAMP),
  date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId") DO NOTHING;
