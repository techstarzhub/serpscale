-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- Backfill: mark every EXISTING user as already onboarded (so only users created
-- after this migration — invited members / clients — get the first-login wizard).
UPDATE "User" SET "onboardedAt" = "createdAt" WHERE "onboardedAt" IS NULL;
