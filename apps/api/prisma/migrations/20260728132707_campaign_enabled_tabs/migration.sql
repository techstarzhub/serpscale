-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "enabledTabs" TEXT[] DEFAULT ARRAY[]::TEXT[];
