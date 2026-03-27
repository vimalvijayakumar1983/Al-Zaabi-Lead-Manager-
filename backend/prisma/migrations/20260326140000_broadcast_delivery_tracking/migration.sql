-- Add delivery/read tracking columns to broadcast runs
ALTER TABLE "whatsapp_broadcast_runs"
  ADD COLUMN IF NOT EXISTS "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "readCount"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "repliedCount"   INTEGER NOT NULL DEFAULT 0;

-- Add delivery/read timestamps to broadcast recipients
-- Also extend status to include DELIVERED and READ states
ALTER TABLE "whatsapp_broadcast_recipients"
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "readAt"      TIMESTAMP(3);

-- Add index on waMessageId for fast webhook lookups
CREATE INDEX IF NOT EXISTS "whatsapp_broadcast_recipients_waMessageId_idx"
  ON "whatsapp_broadcast_recipients"("waMessageId");
