-- AlterTable
ALTER TABLE "communications" ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "communications" ADD COLUMN "readAt" TIMESTAMP(3);

-- Mark all existing outbound messages as read (sent by us)
UPDATE "communications" SET "isRead" = true WHERE "direction" = 'OUTBOUND';

-- CreateIndex
CREATE INDEX "communications_leadId_isRead_direction_idx" ON "communications"("leadId", "isRead", "direction");
