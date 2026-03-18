-- CreateEnum
CREATE TYPE "LeadSLAStatus" AS ENUM ('ON_TIME', 'AT_RISK', 'BREACHED', 'ESCALATED', 'RESPONDED');

-- AlterEnum (add new activity types)
ALTER TYPE "ActivityType" ADD VALUE 'SLA_REMINDER_SENT';
ALTER TYPE "ActivityType" ADD VALUE 'SLA_ESCALATED';
ALTER TYPE "ActivityType" ADD VALUE 'SLA_REASSIGNED';
ALTER TYPE "ActivityType" ADD VALUE 'SLA_BREACHED';

-- AlterEnum (add new automation triggers)
ALTER TYPE "AutomationTrigger" ADD VALUE 'LEAD_SLA_WARNING';
ALTER TYPE "AutomationTrigger" ADD VALUE 'LEAD_SLA_BREACHED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'LEAD_SLA_ESCALATED';

-- AlterTable: Add SLA tracking fields to leads
ALTER TABLE "leads" ADD COLUMN "firstRespondedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "slaStatus" "LeadSLAStatus" NOT NULL DEFAULT 'ON_TIME';
ALTER TABLE "leads" ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "leads" ADD COLUMN "lastEscalatedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "slaBreachedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leads_organizationId_slaStatus_idx" ON "leads"("organizationId", "slaStatus");
