-- CreateTable (already exists in DB, use IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "division_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES_REP',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "division_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "division_memberships_userId_divisionId_key" ON "division_memberships"("userId", "divisionId");
CREATE INDEX IF NOT EXISTS "division_memberships_userId_idx" ON "division_memberships"("userId");
CREATE INDEX IF NOT EXISTS "division_memberships_divisionId_idx" ON "division_memberships"("divisionId");

-- AddForeignKey (skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'division_memberships_userId_fkey') THEN
    ALTER TABLE "division_memberships" ADD CONSTRAINT "division_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'division_memberships_divisionId_fkey') THEN
    ALTER TABLE "division_memberships" ADD CONSTRAINT "division_memberships_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
