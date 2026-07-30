-- Public read-only share link for a campaign.
ALTER TABLE "Project" ADD COLUMN "shareKey" TEXT;
ALTER TABLE "Project" ADD COLUMN "sharedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Project_shareKey_key" ON "Project"("shareKey");
