ALTER TYPE "SubscriptionChangeStatus" ADD VALUE 'PAYMENT_PENDING';

CREATE TYPE "InvoiceKind" AS ENUM ('PLAN_CHANGE', 'RENEWAL');
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID', 'EXPIRED');
CREATE TYPE "PaymentMethod" AS ENUM ('MANUAL', 'SSLCOMMERZ');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'UNDER_REVIEW', 'PAID', 'FAILED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'REFUNDED');
CREATE TYPE "ManualPaymentChannel" AS ENUM ('BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'WISE', 'PAYONEER', 'OTHER');

ALTER TABLE "BillingPreference" ADD COLUMN "billingPhone" TEXT;

CREATE TABLE "BillingInvoice" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "kind" "InvoiceKind" NOT NULL DEFAULT 'PLAN_CHANGE',
  "renewalKey" TEXT,
  "workspaceId" TEXT NOT NULL,
  "subscriptionChangeId" TEXT,
  "requestedById" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" BIGINT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "providerTransactionId" TEXT,
  "gatewaySessionId" TEXT,
  "validationId" TEXT,
  "bankTransactionId" TEXT,
  "riskLevel" INTEGER,
  "riskTitle" TEXT,
  "failureReason" TEXT,
  "rawInitiation" JSONB,
  "rawNotification" JSONB,
  "rawValidation" JSONB,
  "initiatedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualPaymentAccount" (
  "id" TEXT NOT NULL,
  "currency" "BillingCurrency" NOT NULL,
  "channel" "ManualPaymentChannel" NOT NULL,
  "label" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "bankName" TEXT,
  "branchName" TEXT,
  "routingNumber" TEXT,
  "instructions" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualPaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualPaymentSubmission" (
  "id" TEXT NOT NULL,
  "paymentAttemptId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "transactionReference" TEXT NOT NULL,
  "senderAccount" TEXT,
  "senderName" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "proofStorageKey" TEXT,
  "proofFilename" TEXT,
  "proofContentType" TEXT,
  "proofSizeBytes" BIGINT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualPaymentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "transactionId" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "processingError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingInvoice_number_key" ON "BillingInvoice"("number");
CREATE UNIQUE INDEX "BillingInvoice_renewalKey_key" ON "BillingInvoice"("renewalKey");
CREATE UNIQUE INDEX "BillingInvoice_subscriptionChangeId_key" ON "BillingInvoice"("subscriptionChangeId");
CREATE INDEX "BillingInvoice_workspaceId_status_createdAt_idx" ON "BillingInvoice"("workspaceId", "status", "createdAt");
CREATE INDEX "BillingInvoice_workspaceId_kind_periodStart_idx" ON "BillingInvoice"("workspaceId", "kind", "periodStart");
CREATE INDEX "BillingInvoice_dueAt_status_idx" ON "BillingInvoice"("dueAt", "status");
CREATE UNIQUE INDEX "PaymentAttempt_providerTransactionId_key" ON "PaymentAttempt"("providerTransactionId");
CREATE INDEX "PaymentAttempt_invoiceId_status_createdAt_idx" ON "PaymentAttempt"("invoiceId", "status", "createdAt");
CREATE INDEX "PaymentAttempt_method_status_createdAt_idx" ON "PaymentAttempt"("method", "status", "createdAt");
CREATE INDEX "ManualPaymentAccount_currency_isActive_sortOrder_idx" ON "ManualPaymentAccount"("currency", "isActive", "sortOrder");
CREATE UNIQUE INDEX "ManualPaymentSubmission_paymentAttemptId_key" ON "ManualPaymentSubmission"("paymentAttemptId");
CREATE UNIQUE INDEX "ManualPaymentSubmission_accountId_transactionReference_key" ON "ManualPaymentSubmission"("accountId", "transactionReference");
CREATE INDEX "ManualPaymentSubmission_reviewedAt_createdAt_idx" ON "ManualPaymentSubmission"("reviewedAt", "createdAt");
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventKey_key" ON "PaymentWebhookEvent"("eventKey");
CREATE INDEX "PaymentWebhookEvent_provider_transactionId_createdAt_idx" ON "PaymentWebhookEvent"("provider", "transactionId", "createdAt");

ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_subscriptionChangeId_fkey" FOREIGN KEY ("subscriptionChangeId") REFERENCES "SubscriptionChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ManualPaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
