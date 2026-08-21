-- Make projectId optional on Crawl to support quick (project-less) audits.
ALTER TABLE "Crawl" ALTER COLUMN "projectId" DROP NOT NULL;

-- Track which user owns a quick audit crawl.
ALTER TABLE "Crawl" ADD COLUMN "byUserId" TEXT;

CREATE INDEX "Crawl_byUserId_idx" ON "Crawl"("byUserId");
