-- AlterTable
ALTER TABLE "SearchHistory" ADD COLUMN     "result" JSONB,
ADD COLUMN     "resultAt" TIMESTAMP(3);
