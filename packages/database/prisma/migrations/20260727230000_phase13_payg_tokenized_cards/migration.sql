-- Phase 13: tokenized card-on-file and selective pay-as-you-go overages.
-- Raw card numbers, expiry values and CVV are never stored by this schema.

CREATE TYPE "CardVaultProvider" AS ENUM ('STRIPE', 'SSLCOMMERZ');
CREATE TYPE "SavedPaymentMethodStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'REQUIRES_ACTION',
  'EXPIRED',
  'FAILED',
  'REMOVED'
);
CREATE TYPE "PaygPolicyStatus" AS ENUM (
  'DISABLED',
  'ACTIVE',
  'PAUSED_PAYMENT_FAILED'
);
CREATE TYPE "PaygAuthorizationStatus" AS ENUM (
  'ACTIVE',
  'COMMITTED',
  'RELEASED',
  'EXPIRED'
);
CREATE TYPE "PaygLedgerStatus" AS ENUM (
  'PENDING',
  'CHARGED',
  'FAILED',
  'WAIVED'
);
CREATE TYPE "PaygChargeStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'REQUIRES_ACTION',
  'CANCELLED'
);

ALTER TABLE "UploadSession"
  ADD COLUMN "paygOperationKeyPrefix" TEXT;

CREATE TABLE "BillingProviderCustomer" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" "CardVaultProvider" NOT NULL,
  "providerCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingProviderCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedPaymentMethod" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerCustomerRecordId" TEXT NOT NULL,
  "provider" "CardVaultProvider" NOT NULL,
  "providerPaymentMethodId" TEXT NOT NULL,
  "brand" TEXT,
  "last4" TEXT,
  "expMonth" INTEGER,
  "expYear" INTEGER,
  "cardholderName" TEXT,
  "billingEmail" TEXT,
  "status" "SavedPaymentMethodStatus" NOT NULL DEFAULT 'PENDING',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "consentVersion" TEXT NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaygPolicy" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "status" "PaygPolicyStatus" NOT NULL DEFAULT 'DISABLED',
  "currency" "BillingCurrency" NOT NULL,
  "monthlySpendCapMinor" BIGINT NOT NULL,
  "chargeThresholdMinor" BIGINT NOT NULL,
  "defaultPaymentMethodId" TEXT,
  "consentVersion" TEXT NOT NULL,
  "consentAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "pauseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaygPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaygMetricSetting" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "metricSpendCapMinor" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaygMetricSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaygAuthorization" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "operationKey" TEXT NOT NULL,
  "requestedQuantity" BIGINT NOT NULL,
  "estimatedAmountMinor" BIGINT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" "PaygAuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "committedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaygAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaygChargeAttempt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "paymentMethodId" TEXT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "status" "PaygChargeStatus" NOT NULL DEFAULT 'PENDING',
  "providerPaymentIntentId" TEXT,
  "failureCode" TEXT,
  "failureReason" TEXT,
  "initiatedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaygChargeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaygLedgerEntry" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "usageEventId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "quantity" BIGINT NOT NULL,
  "billableUnits" BIGINT NOT NULL,
  "unitSize" BIGINT NOT NULL,
  "unitPriceMinor" BIGINT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "status" "PaygLedgerStatus" NOT NULL DEFAULT 'PENDING',
  "chargeAttemptId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaygLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingProviderCustomer_workspaceId_provider_key"
  ON "BillingProviderCustomer"("workspaceId", "provider");
CREATE UNIQUE INDEX "BillingProviderCustomer_provider_providerCustomerId_key"
  ON "BillingProviderCustomer"("provider", "providerCustomerId");

CREATE UNIQUE INDEX "SavedPaymentMethod_providerPaymentMethodId_key"
  ON "SavedPaymentMethod"("providerPaymentMethodId");
CREATE INDEX "SavedPaymentMethod_workspaceId_status_isDefault_idx"
  ON "SavedPaymentMethod"("workspaceId", "status", "isDefault");

CREATE UNIQUE INDEX "PaygPolicy_workspaceId_key"
  ON "PaygPolicy"("workspaceId");
CREATE INDEX "PaygPolicy_status_currency_idx"
  ON "PaygPolicy"("status", "currency");

CREATE UNIQUE INDEX "PaygMetricSetting_policyId_metric_key"
  ON "PaygMetricSetting"("policyId", "metric");
CREATE INDEX "PaygMetricSetting_metric_enabled_idx"
  ON "PaygMetricSetting"("metric", "enabled");

CREATE UNIQUE INDEX "PaygAuthorization_operationKey_key"
  ON "PaygAuthorization"("operationKey");
CREATE INDEX "PaygAuthorization_workspaceId_metric_status_idx"
  ON "PaygAuthorization"("workspaceId", "metric", "status");
CREATE INDEX "PaygAuthorization_expiresAt_status_idx"
  ON "PaygAuthorization"("expiresAt", "status");

CREATE UNIQUE INDEX "PaygChargeAttempt_providerPaymentIntentId_key"
  ON "PaygChargeAttempt"("providerPaymentIntentId");
CREATE INDEX "PaygChargeAttempt_workspaceId_status_createdAt_idx"
  ON "PaygChargeAttempt"("workspaceId", "status", "createdAt");

CREATE UNIQUE INDEX "PaygLedgerEntry_usageEventId_key"
  ON "PaygLedgerEntry"("usageEventId");
CREATE INDEX "PaygLedgerEntry_workspaceId_status_periodStart_idx"
  ON "PaygLedgerEntry"("workspaceId", "status", "periodStart");
CREATE INDEX "PaygLedgerEntry_chargeAttemptId_idx"
  ON "PaygLedgerEntry"("chargeAttemptId");

ALTER TABLE "BillingProviderCustomer"
  ADD CONSTRAINT "BillingProviderCustomer_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedPaymentMethod"
  ADD CONSTRAINT "SavedPaymentMethod_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedPaymentMethod"
  ADD CONSTRAINT "SavedPaymentMethod_providerCustomerRecordId_fkey"
  FOREIGN KEY ("providerCustomerRecordId") REFERENCES "BillingProviderCustomer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaygPolicy"
  ADD CONSTRAINT "PaygPolicy_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaygPolicy"
  ADD CONSTRAINT "PaygPolicy_defaultPaymentMethodId_fkey"
  FOREIGN KEY ("defaultPaymentMethodId") REFERENCES "SavedPaymentMethod"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaygMetricSetting"
  ADD CONSTRAINT "PaygMetricSetting_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "PaygPolicy"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaygAuthorization"
  ADD CONSTRAINT "PaygAuthorization_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaygChargeAttempt"
  ADD CONSTRAINT "PaygChargeAttempt_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaygChargeAttempt"
  ADD CONSTRAINT "PaygChargeAttempt_paymentMethodId_fkey"
  FOREIGN KEY ("paymentMethodId") REFERENCES "SavedPaymentMethod"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaygLedgerEntry"
  ADD CONSTRAINT "PaygLedgerEntry_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaygLedgerEntry"
  ADD CONSTRAINT "PaygLedgerEntry_usageEventId_fkey"
  FOREIGN KEY ("usageEventId") REFERENCES "UsageEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaygLedgerEntry"
  ADD CONSTRAINT "PaygLedgerEntry_chargeAttemptId_fkey"
  FOREIGN KEY ("chargeAttemptId") REFERENCES "PaygChargeAttempt"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
