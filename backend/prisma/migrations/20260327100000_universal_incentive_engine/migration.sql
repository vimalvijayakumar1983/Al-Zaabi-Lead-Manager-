-- Universal Incentive & Attribution Engine

CREATE TYPE "IncentivePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "IncentiveRuleSetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "IncentiveRuleVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "IncentiveEventType" AS ENUM (
  'outreach_made',
  'appointment_booked',
  'visit_checked_in',
  'conversion_won',
  'invoice_posted',
  'refund_issued',
  'cancellation',
  'renewal',
  'custom_event'
);
CREATE TYPE "IncentiveEventProcessingStatus" AS ENUM ('RECEIVED', 'NORMALIZED', 'ATTRIBUTED', 'EARNED', 'EXCLUDED', 'FAILED');
CREATE TYPE "IncentiveAttributionStrategy" AS ENUM ('last_valid_owner', 'first_touch', 'weighted_split', 'custom_rule_hook');
CREATE TYPE "IncentiveEarningStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED');
CREATE TYPE "IncentiveAdjustmentType" AS ENUM ('FULL_CLAWBACK', 'PARTIAL_CLAWBACK', 'SAME_CYCLE_REVERSAL', 'NEXT_CYCLE_ADJUSTMENT', 'MANUAL');
CREATE TYPE "IncentiveAdjustmentWorkflowStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED');
CREATE TYPE "IncentiveAdjustmentCycle" AS ENUM ('SAME', 'NEXT');
CREATE TYPE "IncentiveStatementStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'LOCKED', 'PAID');
CREATE TYPE "IncentiveStatementLineType" AS ENUM ('EARNING', 'ADJUSTMENT', 'MANUAL');
CREATE TYPE "IncentiveDisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');
CREATE TYPE "IncentiveExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "incentive_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "IncentivePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_rule_sets" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "IncentiveRuleSetStatus" NOT NULL DEFAULT 'DRAFT',
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_rule_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_rule_versions" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "IncentiveRuleVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "attributionStrategy" "IncentiveAttributionStrategy" NOT NULL DEFAULT 'last_valid_owner',
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 90,
    "freezeField" TEXT,
    "earningsConfig" JSONB NOT NULL DEFAULT '{}',
    "customHookKey" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_rule_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" "IncentiveEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceSystem" TEXT,
    "sourceMetadata" JSONB NOT NULL DEFAULT '{}',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "leadId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "orderExternalId" TEXT,
    "invoiceExternalId" TEXT,
    "amount" DECIMAL(14,2),
    "processingStatus" "IncentiveEventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "normalizedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_attributions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weight" DECIMAL(8,6) NOT NULL,
    "strategy" "IncentiveAttributionStrategy" NOT NULL,
    "explain" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incentive_attributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_earnings" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trace" JSONB NOT NULL DEFAULT '{}',
    "status" "IncentiveEarningStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_earnings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_adjustments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "type" "IncentiveAdjustmentType" NOT NULL,
    "targetEarningId" TEXT,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "workflowStatus" "IncentiveAdjustmentWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "cycle" "IncentiveAdjustmentCycle" NOT NULL DEFAULT 'NEXT',
    "appliesToStatementId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_statements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "IncentiveStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payoutRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "statusHistory" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_statement_lines" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineType" "IncentiveStatementLineType" NOT NULL,
    "earningId" TEXT,
    "adjustmentId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "trace" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incentive_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_disputes" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "IncentiveDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_disputes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incentive_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incentive_exceptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "eventId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remediationHint" TEXT,
    "status" "IncentiveExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incentive_exceptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "incentive_plans" ADD CONSTRAINT "incentive_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_rule_sets" ADD CONSTRAINT "incentive_rule_sets_planId_fkey" FOREIGN KEY ("planId") REFERENCES "incentive_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_rule_versions" ADD CONSTRAINT "incentive_rule_versions_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "incentive_rule_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_events" ADD CONSTRAINT "incentive_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_attributions" ADD CONSTRAINT "incentive_attributions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "incentive_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_earnings" ADD CONSTRAINT "incentive_earnings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "incentive_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_earnings" ADD CONSTRAINT "incentive_earnings_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "incentive_attributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_earnings" ADD CONSTRAINT "incentive_earnings_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "incentive_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incentive_adjustments" ADD CONSTRAINT "incentive_adjustments_targetEarningId_fkey" FOREIGN KEY ("targetEarningId") REFERENCES "incentive_earnings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incentive_adjustments" ADD CONSTRAINT "incentive_adjustments_appliesToStatementId_fkey" FOREIGN KEY ("appliesToStatementId") REFERENCES "incentive_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incentive_statements" ADD CONSTRAINT "incentive_statements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_statement_lines" ADD CONSTRAINT "incentive_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "incentive_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_statement_lines" ADD CONSTRAINT "incentive_statement_lines_earningId_fkey" FOREIGN KEY ("earningId") REFERENCES "incentive_earnings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incentive_statement_lines" ADD CONSTRAINT "incentive_statement_lines_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "incentive_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incentive_disputes" ADD CONSTRAINT "incentive_disputes_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "incentive_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_disputes" ADD CONSTRAINT "incentive_disputes_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_audit_logs" ADD CONSTRAINT "incentive_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incentive_exceptions" ADD CONSTRAINT "incentive_exceptions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "incentive_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "incentive_events_organizationId_idempotencyKey_key" ON "incentive_events"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "incentive_rule_versions_ruleSetId_version_key" ON "incentive_rule_versions"("ruleSetId", "version");

CREATE INDEX "incentive_plans_organizationId_divisionId_idx" ON "incentive_plans"("organizationId", "divisionId");
CREATE INDEX "incentive_plans_organizationId_status_idx" ON "incentive_plans"("organizationId", "status");
CREATE INDEX "incentive_plans_effectiveFrom_effectiveTo_idx" ON "incentive_plans"("effectiveFrom", "effectiveTo");
CREATE INDEX "incentive_rule_sets_planId_idx" ON "incentive_rule_sets"("planId");
CREATE INDEX "incentive_rule_versions_ruleSetId_status_idx" ON "incentive_rule_versions"("ruleSetId", "status");
CREATE INDEX "incentive_rule_versions_effectiveFrom_effectiveTo_idx" ON "incentive_rule_versions"("effectiveFrom", "effectiveTo");
CREATE INDEX "incentive_events_organizationId_divisionId_occurredAt_idx" ON "incentive_events"("organizationId", "divisionId", "occurredAt");
CREATE INDEX "incentive_events_organizationId_eventType_occurredAt_idx" ON "incentive_events"("organizationId", "eventType", "occurredAt");
CREATE INDEX "incentive_events_processingStatus_idx" ON "incentive_events"("processingStatus");
CREATE INDEX "incentive_events_leadId_idx" ON "incentive_events"("leadId");
CREATE INDEX "incentive_attributions_eventId_idx" ON "incentive_attributions"("eventId");
CREATE INDEX "incentive_attributions_organizationId_divisionId_userId_idx" ON "incentive_attributions"("organizationId", "divisionId", "userId");
CREATE INDEX "incentive_attributions_userId_idx" ON "incentive_attributions"("userId");
CREATE INDEX "incentive_earnings_eventId_idx" ON "incentive_earnings"("eventId");
CREATE INDEX "incentive_earnings_organizationId_divisionId_userId_idx" ON "incentive_earnings"("organizationId", "divisionId", "userId");
CREATE INDEX "incentive_earnings_ruleVersionId_idx" ON "incentive_earnings"("ruleVersionId");
CREATE INDEX "incentive_earnings_status_idx" ON "incentive_earnings"("status");
CREATE INDEX "incentive_adjustments_organizationId_divisionId_idx" ON "incentive_adjustments"("organizationId", "divisionId");
CREATE INDEX "incentive_adjustments_workflowStatus_idx" ON "incentive_adjustments"("workflowStatus");
CREATE INDEX "incentive_adjustments_targetEarningId_idx" ON "incentive_adjustments"("targetEarningId");
CREATE INDEX "incentive_statements_organizationId_divisionId_userId_idx" ON "incentive_statements"("organizationId", "divisionId", "userId");
CREATE INDEX "incentive_statements_organizationId_divisionId_periodStart_periodEnd_idx" ON "incentive_statements"("organizationId", "divisionId", "periodStart", "periodEnd");
CREATE INDEX "incentive_statements_status_idx" ON "incentive_statements"("status");
CREATE INDEX "incentive_statement_lines_statementId_idx" ON "incentive_statement_lines"("statementId");
CREATE INDEX "incentive_statement_lines_earningId_idx" ON "incentive_statement_lines"("earningId");
CREATE INDEX "incentive_disputes_statementId_idx" ON "incentive_disputes"("statementId");
CREATE INDEX "incentive_disputes_status_idx" ON "incentive_disputes"("status");
CREATE INDEX "incentive_audit_logs_organizationId_divisionId_createdAt_idx" ON "incentive_audit_logs"("organizationId", "divisionId", "createdAt");
CREATE INDEX "incentive_audit_logs_modelType_modelId_idx" ON "incentive_audit_logs"("modelType", "modelId");
CREATE INDEX "incentive_exceptions_organizationId_divisionId_status_idx" ON "incentive_exceptions"("organizationId", "divisionId", "status");
CREATE INDEX "incentive_exceptions_eventId_idx" ON "incentive_exceptions"("eventId");
