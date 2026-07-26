ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

CREATE TYPE "VariantStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "VariantKind" AS ENUM ('THUMBNAIL', 'PREVIEW');

ALTER TABLE "MediaAsset"
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "durationSeconds" DOUBLE PRECISION;

CREATE TABLE "MediaVariant" (
  "id" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "kind" "VariantKind" NOT NULL,
  "format" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "quality" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" BIGINT,
  "status" "VariantStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaVariant_storageKey_key"
ON "MediaVariant"("storageKey");

CREATE UNIQUE INDEX "MediaVariant_mediaAssetId_kind_key"
ON "MediaVariant"("mediaAssetId", "kind");

CREATE INDEX "MediaVariant_status_createdAt_idx"
ON "MediaVariant"("status", "createdAt");

ALTER TABLE "MediaVariant"
ADD CONSTRAINT "MediaVariant_mediaAssetId_fkey"
FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
