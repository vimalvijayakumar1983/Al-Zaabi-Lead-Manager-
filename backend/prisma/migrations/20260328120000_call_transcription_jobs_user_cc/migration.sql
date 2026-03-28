-- AlterTable
ALTER TABLE "users" ADD COLUMN "call_center_agent_id" TEXT,
ADD COLUMN "call_center_extension" TEXT;

-- CreateTable
CREATE TABLE "call_transcription_jobs" (
    "id" TEXT NOT NULL,
    "call_log_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_transcription_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_transcription_jobs_call_log_id_key" ON "call_transcription_jobs"("call_log_id");

-- CreateIndex
CREATE INDEX "call_transcription_jobs_organization_id_status_idx" ON "call_transcription_jobs"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "call_transcription_jobs" ADD CONSTRAINT "call_transcription_jobs_call_log_id_fkey" FOREIGN KEY ("call_log_id") REFERENCES "call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_transcription_jobs" ADD CONSTRAINT "call_transcription_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
