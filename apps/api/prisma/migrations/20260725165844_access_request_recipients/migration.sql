-- AlterTable
ALTER TABLE "AccessRequest" ADD COLUMN     "recipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
