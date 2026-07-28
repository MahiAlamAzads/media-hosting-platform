-- Phase 12: exact usage thresholds, reliable email delivery state and retries.

CREATE TYPE "UsageAlertEmailStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED'
);

ALTER TABLE "UsageAlert"
  ADD COLUMN "emailStatus" "UsageAlertEmailStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "emailRecipient" TEXT,
  ADD COLUMN "emailSentAt" TIMESTAMP(3),
  ADD COLUMN "lastEmailAttemptAt" TIMESTAMP(3),
  ADD COLUMN "emailLastError" TEXT;

CREATE INDEX "UsageAlert_emailStatus_lastEmailAttemptAt_idx"
  ON "UsageAlert"("emailStatus", "lastEmailAttemptAt");
