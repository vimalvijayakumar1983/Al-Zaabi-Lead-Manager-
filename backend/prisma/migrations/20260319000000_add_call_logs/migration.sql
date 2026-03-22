-- CreateEnum
CREATE TYPE "CallDisposition" AS ENUM (
  'CALLBACK',
  'MEETING_ARRANGED',
  'APPOINTMENT_BOOKED',
  'INTERESTED',
  'NOT_INTERESTED',
  'NO_ANSWER',
  'VOICEMAIL_LEFT',
  'WRONG_NUMBER',
  'BUSY',
  'GATEKEEPER',
  'FOLLOW_UP_EMAIL',
  'QUALIFIED',
  'PROPOSAL_REQUESTED',
  'DO_NOT_CALL',
  'OTHER'
);

-- CreateTable
CREATE TABLE "call_logs" (
  "id" TEXT NOT NULL,
  "disposition" "CallDisposition" NOT NULL,
  "notes" TEXT,
  "duration" INTEGER,
  "callbackDate" TIMESTAMP(3),
  "meetingDate" TIMESTAMP(3),
  "appointmentDate" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leadId" TEXT NOT NULL,
  "userId" TEXT,
  "followUpTaskId" TEXT,

  CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_logs_leadId_createdAt_idx" ON "call_logs"("leadId", "createdAt");
CREATE INDEX "call_logs_disposition_idx" ON "call_logs"("disposition");

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
