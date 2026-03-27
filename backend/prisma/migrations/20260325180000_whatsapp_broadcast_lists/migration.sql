-- CreateTable
CREATE TABLE "whatsapp_broadcast_lists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_broadcast_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_broadcast_list_members" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneRaw" TEXT,
    "displayName" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_broadcast_list_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_lists_organizationId_createdAt_idx" ON "whatsapp_broadcast_lists"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_lists_organizationId_slug_key" ON "whatsapp_broadcast_lists"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_list_members_listId_idx" ON "whatsapp_broadcast_list_members"("listId");

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_list_members_leadId_idx" ON "whatsapp_broadcast_list_members"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_list_members_listId_phone_key" ON "whatsapp_broadcast_list_members"("listId", "phone");

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_lists" ADD CONSTRAINT "whatsapp_broadcast_lists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_list_members" ADD CONSTRAINT "whatsapp_broadcast_list_members_listId_fkey" FOREIGN KEY ("listId") REFERENCES "whatsapp_broadcast_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_list_members" ADD CONSTRAINT "whatsapp_broadcast_list_members_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
