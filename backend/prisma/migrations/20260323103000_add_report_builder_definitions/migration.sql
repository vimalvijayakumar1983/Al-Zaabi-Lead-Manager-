-- CreateTable
CREATE TABLE IF NOT EXISTS "report_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataset" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "visibility" TEXT NOT NULL DEFAULT 'everyone',
    "visibleToUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibleToRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "report_definitions_organizationId_idx" ON "report_definitions"("organizationId");
CREATE INDEX IF NOT EXISTS "report_definitions_divisionId_idx" ON "report_definitions"("divisionId");
CREATE INDEX IF NOT EXISTS "report_definitions_createdById_idx" ON "report_definitions"("createdById");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_definitions_organizationId_fkey') THEN
    ALTER TABLE "report_definitions"
      ADD CONSTRAINT "report_definitions_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_definitions_createdById_fkey') THEN
    ALTER TABLE "report_definitions"
      ADD CONSTRAINT "report_definitions_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
