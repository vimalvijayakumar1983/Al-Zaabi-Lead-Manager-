-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ContactLifecycle" AS ENUM ('SUBSCRIBER', 'LEAD', 'MARKETING_QUALIFIED', 'SALES_QUALIFIED', 'OPPORTUNITY', 'CUSTOMER', 'EVANGELIST', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ContactType" AS ENUM ('PROSPECT', 'CUSTOMER', 'PARTNER', 'VENDOR', 'INFLUENCER', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "lifecycle" "ContactLifecycle" NOT NULL DEFAULT 'SUBSCRIBER',
    "type" "ContactType" NOT NULL DEFAULT 'PROSPECT',
    "salutation" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "website" TEXT,
    "linkedin" TEXT,
    "twitter" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "description" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "lastContactedAt" TIMESTAMP(3),
    "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
    "doNotCall" BOOLEAN NOT NULL DEFAULT false,
    "hasOptedOutEmail" BOOLEAN NOT NULL DEFAULT false,
    "customData" JSONB DEFAULT '{}',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "convertedFromLeadId" TEXT,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_activities" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "contact_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_notes" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "stage" TEXT NOT NULL DEFAULT 'QUALIFICATION',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "closeDate" TIMESTAMP(3),
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "contactId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- Add contactId to tasks table
ALTER TABLE "tasks" ADD COLUMN "contactId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contacts_convertedFromLeadId_key" ON "contacts"("convertedFromLeadId");
CREATE INDEX "contacts_organizationId_lifecycle_idx" ON "contacts"("organizationId", "lifecycle");
CREATE INDEX "contacts_organizationId_type_idx" ON "contacts"("organizationId", "type");
CREATE INDEX "contacts_email_idx" ON "contacts"("email");
CREATE INDEX "contact_activities_contactId_createdAt_idx" ON "contact_activities"("contactId", "createdAt");
CREATE INDEX "contact_notes_contactId_idx" ON "contact_notes"("contactId");
CREATE INDEX "deals_contactId_idx" ON "deals"("contactId");
CREATE INDEX "deals_organizationId_status_idx" ON "deals"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_convertedFromLeadId_fkey" FOREIGN KEY ("convertedFromLeadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
