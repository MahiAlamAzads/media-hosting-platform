ALTER TABLE "Session"
ADD COLUMN "replacedBySessionId" TEXT,
ADD COLUMN "reuseDetectedAt" TIMESTAMP(3);

CREATE TABLE "PendingEmailChange" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "newEmail" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingEmailChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingEmailChange_tokenHash_key"
ON "PendingEmailChange"("tokenHash");

CREATE INDEX "PendingEmailChange_userId_createdAt_idx"
ON "PendingEmailChange"("userId", "createdAt");

CREATE INDEX "PendingEmailChange_normalizedEmail_idx"
ON "PendingEmailChange"("normalizedEmail");

ALTER TABLE "PendingEmailChange"
ADD CONSTRAINT "PendingEmailChange_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LoginAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "normalizedEmail" TEXT NOT NULL,
  "ipAddress" TEXT,
  "succeeded" BOOLEAN NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginAttempt_normalizedEmail_createdAt_idx"
ON "LoginAttempt"("normalizedEmail", "createdAt");

CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx"
ON "LoginAttempt"("ipAddress", "createdAt");

CREATE INDEX "LoginAttempt_userId_createdAt_idx"
ON "LoginAttempt"("userId", "createdAt");

ALTER TABLE "LoginAttempt"
ADD CONSTRAINT "LoginAttempt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
