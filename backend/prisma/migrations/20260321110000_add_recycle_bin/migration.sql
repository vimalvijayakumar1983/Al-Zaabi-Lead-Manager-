-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "RecycleEntityType" AS ENUM ('LEAD', 'CONTACT', 'TASK', 'CAMPAIGN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "recycle_bin_items" (
    "id" TEXT NOT NULL,
    "entityType" "RecycleEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "organizationId" TEXT NOT NULL,
    "deletedById" TEXT,
    "recordOwnerId" TEXT,
    "recordAssigneeId" TEXT,
    "recordCreatorId" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recycle_bin_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recycle_bin_items_entityType_entityId_key" ON "recycle_bin_items"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "recycle_bin_items_organizationId_deletedAt_idx" ON "recycle_bin_items"("organizationId", "deletedAt");
CREATE INDEX IF NOT EXISTS "recycle_bin_items_organizationId_purgeAt_idx" ON "recycle_bin_items"("organizationId", "purgeAt");
CREATE INDEX IF NOT EXISTS "recycle_bin_items_entityType_organizationId_idx" ON "recycle_bin_items"("entityType", "organizationId");
CREATE INDEX IF NOT EXISTS "recycle_bin_items_recordOwnerId_idx" ON "recycle_bin_items"("recordOwnerId");
CREATE INDEX IF NOT EXISTS "recycle_bin_items_recordAssigneeId_idx" ON "recycle_bin_items"("recordAssigneeId");
CREATE INDEX IF NOT EXISTS "recycle_bin_items_recordCreatorId_idx" ON "recycle_bin_items"("recordCreatorId");
