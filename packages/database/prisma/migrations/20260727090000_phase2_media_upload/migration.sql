CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED', 'DELETED');
CREATE TYPE "UploadStatus" AS ENUM ('ACTIVE', 'COMPLETING', 'COMPLETED', 'ABORTED', 'EXPIRED');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');

ALTER TABLE "Workspace"
ADD COLUMN "storageLimitBytes" BIGINT NOT NULL DEFAULT 107374182400,
ADD COLUMN "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "storageReservedBytes" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "folderId" TEXT,
  "createdById" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "detectedMediaType" "MediaType" NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksumSha256" TEXT,
  "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UploadSession" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "expectedBytes" BIGINT NOT NULL,
  "receivedBytes" BIGINT NOT NULL DEFAULT 0,
  "chunkSizeBytes" INTEGER NOT NULL,
  "expectedChunks" INTEGER NOT NULL,
  "receivedChunks" INTEGER NOT NULL DEFAULT 0,
  "status" "UploadStatus" NOT NULL DEFAULT 'ACTIVE',
  "tempStorageKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UploadChunk" (
  "id" TEXT NOT NULL,
  "uploadSessionId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE INDEX "MediaAsset_workspaceId_createdAt_id_idx" ON "MediaAsset"("workspaceId", "createdAt", "id");
CREATE INDEX "MediaAsset_workspaceId_folderId_createdAt_id_idx" ON "MediaAsset"("workspaceId", "folderId", "createdAt", "id");
CREATE INDEX "MediaAsset_workspaceId_status_idx" ON "MediaAsset"("workspaceId", "status");
CREATE INDEX "MediaAsset_workspaceId_checksumSha256_idx" ON "MediaAsset"("workspaceId", "checksumSha256");

CREATE UNIQUE INDEX "UploadSession_tempStorageKey_key" ON "UploadSession"("tempStorageKey");
CREATE INDEX "UploadSession_workspaceId_status_idx" ON "UploadSession"("workspaceId", "status");
CREATE INDEX "UploadSession_userId_status_idx" ON "UploadSession"("userId", "status");
CREATE INDEX "UploadSession_expiresAt_idx" ON "UploadSession"("expiresAt");

CREATE UNIQUE INDEX "UploadChunk_storageKey_key" ON "UploadChunk"("storageKey");
CREATE UNIQUE INDEX "UploadChunk_uploadSessionId_chunkIndex_key" ON "UploadChunk"("uploadSessionId", "chunkIndex");

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UploadSession"
ADD CONSTRAINT "UploadSession_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadSession"
ADD CONSTRAINT "UploadSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadSession"
ADD CONSTRAINT "UploadSession_mediaAssetId_fkey"
FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadChunk"
ADD CONSTRAINT "UploadChunk_uploadSessionId_fkey"
FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
