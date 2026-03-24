-- CreateEnum
CREATE TYPE "OfferAssignmentStatus" AS ENUM ('ELIGIBLE', 'CONTACTED', 'ACCEPTED', 'REDEEMED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfferAssignmentSource" AS ENUM ('IMPORT', 'RULE', 'MANUAL', 'API');

-- CreateTable
CREATE TABLE "campaign_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "campaign_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_campaign_assignments" (
    "id" TEXT NOT NULL,
    "status" "OfferAssignmentStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "source" "OfferAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "discussedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "assignedById" TEXT,

    CONSTRAINT "lead_campaign_assignments_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "templateId" TEXT;

-- CreateIndex
CREATE INDEX "campaign_templates_organizationId_isActive_idx" ON "campaign_templates"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "campaign_templates_createdById_idx" ON "campaign_templates"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "lead_campaign_assignment_unique" ON "lead_campaign_assignments"("leadId", "campaignId");

-- CreateIndex
CREATE INDEX "lead_campaign_assignments_organizationId_status_idx" ON "lead_campaign_assignments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "lead_campaign_assignments_organizationId_campaignId_idx" ON "lead_campaign_assignments"("organizationId", "campaignId");

-- CreateIndex
CREATE INDEX "lead_campaign_assignments_organizationId_leadId_idx" ON "lead_campaign_assignments"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "lead_campaign_assignments_expiresAt_idx" ON "lead_campaign_assignments"("expiresAt");

-- CreateIndex
CREATE INDEX "campaigns_templateId_idx" ON "campaigns"("templateId");

-- AddForeignKey
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "campaign_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_campaign_assignments" ADD CONSTRAINT "lead_campaign_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_campaign_assignments" ADD CONSTRAINT "lead_campaign_assignments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_campaign_assignments" ADD CONSTRAINT "lead_campaign_assignments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_campaign_assignments" ADD CONSTRAINT "lead_campaign_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
