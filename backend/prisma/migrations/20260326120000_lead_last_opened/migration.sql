-- AlterTable
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastOpenedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastOpenedById" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_lastOpenedById_fkey'
  ) THEN
    ALTER TABLE "leads" ADD CONSTRAINT "leads_lastOpenedById_fkey"
      FOREIGN KEY ("lastOpenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
