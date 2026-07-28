-- Phase 14: subscription terms, prepaid PAYG wallet and enterprise sales flow.

CREATE TYPE "RevenueModel" AS ENUM (
  'SUBSCRIPTION',
  'PREPAID_PAYG',
  'ENTERPRISE_CUSTOM'
);

CREATE TYPE "SubscriptionTerm" AS ENUM (
  'FREE',
  'THREE_MONTHS',
  'SIX_MONTHS',
  'ONE_YEAR',
  'ENTERPRISE_CUSTOM'
);

CREATE TYPE "WalletStatus" AS ENUM (
  'ACTIVE',
  'FROZEN',
  'CLOSED'
);

CREATE TYPE "WalletTransactionKind" AS ENUM (
  'TOP_UP',
  'PAYG_DEBIT',
  'ADMIN_CREDIT',
  'ADMIN_DEBIT',
  'REFUND',
  'REVERSAL'
);

CREATE TYPE "EnterpriseInquiryStatus" AS ENUM (
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'CLOSED_WON',
  'CLOSED_LOST'
);

ALTER TYPE "InvoiceKind" ADD VALUE IF NOT EXISTS 'WALLET_TOPUP';

-- Phase 14 makes wallet-funded prepaid PAYG the only self-service overage mode.
-- Existing saved-card policies remain in the audit history but are disabled so
-- they cannot bypass the mandatory top-up requirement.
UPDATE "PaygPolicy"
SET
  "status" = 'DISABLED',
  "pausedAt" = CURRENT_TIMESTAMP,
  "pauseReason" = 'Prepaid wallet top-up is required from Phase 14 onward',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" <> 'DISABLED';

ALTER TABLE "WorkspaceSubscription"
  ADD COLUMN "revenueModel" "RevenueModel" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "subscriptionTerm" "SubscriptionTerm" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "commitmentEndsAt" TIMESTAMP(3);

ALTER TABLE "BillingPreference"
  ADD COLUMN "revenueModel" "RevenueModel" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "subscriptionTerm" "SubscriptionTerm" NOT NULL DEFAULT 'FREE';

ALTER TABLE "SubscriptionChange"
  ADD COLUMN "revenueModel" "RevenueModel" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "subscriptionTerm" "SubscriptionTerm" NOT NULL DEFAULT 'THREE_MONTHS';

ALTER TABLE "BillingInvoice"
  ADD COLUMN "revenueModel" "RevenueModel" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "subscriptionTerm" "SubscriptionTerm" NOT NULL DEFAULT 'THREE_MONTHS';

UPDATE "WorkspaceSubscription" ws
SET
  "subscriptionTerm" = CASE
    WHEN p."code" = 'FREE' THEN 'FREE'::"SubscriptionTerm"
    WHEN ws."interval" = 'YEARLY' THEN 'ONE_YEAR'::"SubscriptionTerm"
    ELSE 'THREE_MONTHS'::"SubscriptionTerm"
  END,
  "commitmentEndsAt" = CASE
    WHEN p."code" = 'FREE' THEN NULL
    ELSE ws."periodEnd"
  END
FROM "PlanVersion" pv
JOIN "Plan" p ON p."id" = pv."planId"
WHERE pv."id" = ws."planVersionId";

UPDATE "BillingPreference" bp
SET "subscriptionTerm" = ws."subscriptionTerm"
FROM "WorkspaceSubscription" ws
WHERE ws."workspaceId" = bp."workspaceId";

UPDATE "SubscriptionChange"
SET "subscriptionTerm" = CASE
  WHEN "interval" = 'YEARLY' THEN 'ONE_YEAR'::"SubscriptionTerm"
  ELSE 'THREE_MONTHS'::"SubscriptionTerm"
END;

UPDATE "BillingInvoice"
SET "subscriptionTerm" = CASE
  WHEN "interval" = 'YEARLY' THEN 'ONE_YEAR'::"SubscriptionTerm"
  ELSE 'THREE_MONTHS'::"SubscriptionTerm"
END;

CREATE TABLE "PlanOffer" (
  "id" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "term" "SubscriptionTerm" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanOffer_planVersionId_currency_term_key"
  ON "PlanOffer"("planVersionId", "currency", "term");
CREATE INDEX "PlanOffer_currency_term_isActive_isPublic_idx"
  ON "PlanOffer"("currency", "term", "isActive", "isPublic");

ALTER TABLE "PlanOffer"
  ADD CONSTRAINT "PlanOffer_planVersionId_fkey"
  FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Free is indefinite. Paid offers use the existing monthly/yearly price books:
-- 3 months = monthly x 3, 6 months = monthly x 6, 1 year = current yearly.
INSERT INTO "PlanOffer" (
  "id", "planVersionId", "currency", "term",
  "amountMinor", "isPublic", "isActive", "createdAt", "updatedAt"
)
SELECT
  'offer_' || pv."id" || '_' || pp."currency"::text || '_free',
  pv."id",
  pp."currency",
  'FREE'::"SubscriptionTerm",
  0,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PlanVersion" pv
JOIN "Plan" p ON p."id" = pv."planId"
JOIN "PlanPrice" pp ON pp."planVersionId" = pv."id"
WHERE p."code" = 'FREE'
GROUP BY pv."id", pp."currency"
ON CONFLICT ("planVersionId", "currency", "term") DO NOTHING;

INSERT INTO "PlanOffer" (
  "id", "planVersionId", "currency", "term",
  "amountMinor", "isPublic", "isActive", "createdAt", "updatedAt"
)
SELECT
  'offer_' || pv."id" || '_' || pp."currency"::text || '_3m',
  pv."id",
  pp."currency",
  'THREE_MONTHS'::"SubscriptionTerm",
  pp."amountMinor" * 3,
  true,
  pp."isActive",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PlanVersion" pv
JOIN "Plan" p ON p."id" = pv."planId"
JOIN "PlanPrice" pp
  ON pp."planVersionId" = pv."id"
 AND pp."interval" = 'MONTHLY'
WHERE p."code" <> 'FREE'
ON CONFLICT ("planVersionId", "currency", "term") DO NOTHING;

INSERT INTO "PlanOffer" (
  "id", "planVersionId", "currency", "term",
  "amountMinor", "isPublic", "isActive", "createdAt", "updatedAt"
)
SELECT
  'offer_' || pv."id" || '_' || pp."currency"::text || '_6m',
  pv."id",
  pp."currency",
  'SIX_MONTHS'::"SubscriptionTerm",
  pp."amountMinor" * 6,
  true,
  pp."isActive",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PlanVersion" pv
JOIN "Plan" p ON p."id" = pv."planId"
JOIN "PlanPrice" pp
  ON pp."planVersionId" = pv."id"
 AND pp."interval" = 'MONTHLY'
WHERE p."code" <> 'FREE'
ON CONFLICT ("planVersionId", "currency", "term") DO NOTHING;

INSERT INTO "PlanOffer" (
  "id", "planVersionId", "currency", "term",
  "amountMinor", "isPublic", "isActive", "createdAt", "updatedAt"
)
SELECT
  'offer_' || pv."id" || '_' || pp."currency"::text || '_1y',
  pv."id",
  pp."currency",
  'ONE_YEAR'::"SubscriptionTerm",
  pp."amountMinor",
  true,
  pp."isActive",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PlanVersion" pv
JOIN "Plan" p ON p."id" = pv."planId"
JOIN "PlanPrice" pp
  ON pp."planVersionId" = pv."id"
 AND pp."interval" = 'YEARLY'
WHERE p."code" <> 'FREE'
ON CONFLICT ("planVersionId", "currency", "term") DO NOTHING;

CREATE TABLE "PrepaidWallet" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
  "balanceMinor" BIGINT NOT NULL DEFAULT 0,
  "reservedMinor" BIGINT NOT NULL DEFAULT 0,
  "lowBalanceThresholdMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrepaidWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrepaidWallet_workspaceId_key"
  ON "PrepaidWallet"("workspaceId");
CREATE INDEX "PrepaidWallet_currency_status_idx"
  ON "PrepaidWallet"("currency", "status");

ALTER TABLE "PrepaidWallet"
  ADD CONSTRAINT "PrepaidWallet_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PrepaidWallet" (
  "id", "workspaceId", "currency", "status",
  "balanceMinor", "reservedMinor", "lowBalanceThresholdMinor",
  "createdAt", "updatedAt"
)
SELECT
  'wallet_' || ws."id",
  ws."id",
  ws."currency",
  'ACTIVE'::"WalletStatus",
  0,
  0,
  CASE WHEN ws."currency" = 'BDT' THEN 10000 ELSE 100 END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "WorkspaceSubscription" ws
ON CONFLICT ("workspaceId") DO NOTHING;

CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" "WalletTransactionKind" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "balanceAfterMinor" BIGINT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "invoiceId" TEXT,
  "paygLedgerEntryId" TEXT,
  "reference" TEXT,
  "metadata" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key"
  ON "WalletTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "WalletTransaction_paygLedgerEntryId_key"
  ON "WalletTransaction"("paygLedgerEntryId");
CREATE INDEX "WalletTransaction_workspaceId_createdAt_idx"
  ON "WalletTransaction"("workspaceId", "createdAt");
CREATE INDEX "WalletTransaction_walletId_kind_createdAt_idx"
  ON "WalletTransaction"("walletId", "kind", "createdAt");

ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "PrepaidWallet"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_paygLedgerEntryId_fkey"
  FOREIGN KEY ("paygLedgerEntryId") REFERENCES "PaygLedgerEntry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EnterpriseInquiry" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "EnterpriseInquiryStatus" NOT NULL DEFAULT 'NEW',
  "companyName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "expectedStorageBytes" BIGINT,
  "expectedDeliveryBytes" BIGINT,
  "expectedMonthlyRequests" BIGINT,
  "teamSize" INTEGER,
  "message" TEXT,
  "assignedToId" TEXT,
  "adminNotes" TEXT,
  "contactedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnterpriseInquiry_status_createdAt_idx"
  ON "EnterpriseInquiry"("status", "createdAt");
CREATE INDEX "EnterpriseInquiry_workspaceId_createdAt_idx"
  ON "EnterpriseInquiry"("workspaceId", "createdAt");

ALTER TABLE "EnterpriseInquiry"
  ADD CONSTRAINT "EnterpriseInquiry_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInquiry"
  ADD CONSTRAINT "EnterpriseInquiry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInquiry"
  ADD CONSTRAINT "EnterpriseInquiry_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkspaceSubscription_revenueModel_subscriptionTerm_idx"
  ON "WorkspaceSubscription"("revenueModel", "subscriptionTerm");
CREATE INDEX "BillingPreference_revenueModel_subscriptionTerm_idx"
  ON "BillingPreference"("revenueModel", "subscriptionTerm");
