-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('GROUP', 'DIVISION');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "tradeName" TEXT,
ADD COLUMN "logo" TEXT,
ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#6366f1',
ADD COLUMN "secondaryColor" TEXT NOT NULL DEFAULT '#1e293b',
ADD COLUMN "type" "OrgType" NOT NULL DEFAULT 'DIVISION',
ADD COLUMN "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "organizations_parentId_idx" ON "organizations"("parentId");
