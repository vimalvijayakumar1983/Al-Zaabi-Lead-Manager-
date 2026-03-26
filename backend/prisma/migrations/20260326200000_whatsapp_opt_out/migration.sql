-- Add WhatsApp broadcast opt-out fields to leads
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "whatsappOptOut"     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsappOptOutAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "whatsappOptOutById" TEXT;

-- Index for fast filtering in broadcast sends
CREATE INDEX IF NOT EXISTS "leads_whatsappOptOut_idx" ON "leads"("whatsappOptOut");
