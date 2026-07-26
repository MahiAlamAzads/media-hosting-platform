CREATE TYPE "MediaVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

ALTER TABLE "MediaAsset"
ADD COLUMN "detectedContentType" TEXT,
ADD COLUMN "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE';

CREATE INDEX "MediaAsset_workspaceId_visibility_status_idx"
ON "MediaAsset"("workspaceId", "visibility", "status");
