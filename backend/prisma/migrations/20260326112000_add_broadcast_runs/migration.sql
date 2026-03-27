CREATE TABLE "whatsapp_broadcast_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "requestedById" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'NOW',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "templateId" TEXT,
    "templateName" TEXT NOT NULL,
    "templateLanguage" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_broadcast_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "waMessageId" TEXT,
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_broadcast_runs_organizationId_status_scheduledAt_idx"
ON "whatsapp_broadcast_runs"("organizationId", "status", "scheduledAt");

CREATE INDEX "whatsapp_broadcast_runs_listId_createdAt_idx"
ON "whatsapp_broadcast_runs"("listId", "createdAt");

CREATE INDEX "whatsapp_broadcast_recipients_broadcastId_status_idx"
ON "whatsapp_broadcast_recipients"("broadcastId", "status");

CREATE INDEX "whatsapp_broadcast_recipients_leadId_idx"
ON "whatsapp_broadcast_recipients"("leadId");

CREATE UNIQUE INDEX "whatsapp_broadcast_recipients_broadcastId_leadId_key"
ON "whatsapp_broadcast_recipients"("broadcastId", "leadId");

ALTER TABLE "whatsapp_broadcast_runs"
ADD CONSTRAINT "whatsapp_broadcast_runs_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_broadcast_runs"
ADD CONSTRAINT "whatsapp_broadcast_runs_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "whatsapp_broadcast_lists"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_broadcast_runs"
ADD CONSTRAINT "whatsapp_broadcast_runs_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_broadcast_recipients"
ADD CONSTRAINT "whatsapp_broadcast_recipients_broadcastId_fkey"
FOREIGN KEY ("broadcastId") REFERENCES "whatsapp_broadcast_runs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_broadcast_recipients"
ADD CONSTRAINT "whatsapp_broadcast_recipients_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "leads"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
