-- Optional link from lead attachments to a specific lead note
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "leadNoteId" TEXT;

CREATE INDEX IF NOT EXISTS "attachments_leadNoteId_idx" ON "attachments"("leadNoteId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_leadNoteId_fkey'
  ) THEN
    ALTER TABLE "attachments" ADD CONSTRAINT "attachments_leadNoteId_fkey"
      FOREIGN KEY ("leadNoteId") REFERENCES "lead_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
