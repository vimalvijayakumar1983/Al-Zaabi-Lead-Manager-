-- Lead check-in / check-out sessions + timeline activity types
CREATE TABLE "lead_checkin_sessions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_checkin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_checkin_sessions_leadId_checkedOutAt_idx" ON "lead_checkin_sessions"("leadId", "checkedOutAt");
CREATE INDEX "lead_checkin_sessions_userId_checkedOutAt_idx" ON "lead_checkin_sessions"("userId", "checkedOutAt");

ALTER TABLE "lead_checkin_sessions" ADD CONSTRAINT "lead_checkin_sessions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_checkin_sessions" ADD CONSTRAINT "lead_checkin_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LEAD_CHECK_IN';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LEAD_CHECK_OUT';
