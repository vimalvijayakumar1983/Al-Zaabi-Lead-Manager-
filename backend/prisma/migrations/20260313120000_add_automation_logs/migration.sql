-- CreateTable
CREATE TABLE IF NOT EXISTS "automation_logs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "trigger" TEXT NOT NULL,
    "conditionsMet" BOOLEAN NOT NULL DEFAULT true,
    "actionsExecuted" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "executionTimeMs" INTEGER NOT NULL DEFAULT 0,
    "leadId" TEXT,
    "leadName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "automation_logs_ruleId_createdAt_idx" ON "automation_logs"("ruleId", "createdAt");
CREATE INDEX IF NOT EXISTS "automation_logs_createdAt_idx" ON "automation_logs"("createdAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_logs_ruleId_fkey') THEN
    ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
