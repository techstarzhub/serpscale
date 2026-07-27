-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_orgId_fkey";

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "orgId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
