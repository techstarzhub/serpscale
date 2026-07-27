-- AlterTable
ALTER TABLE "Crawl" ADD COLUMN     "clsScore" DOUBLE PRECISION,
ADD COLUMN     "fcpMs" INTEGER,
ADD COLUMN     "issuesSummary" JSONB,
ADD COLUMN     "lcpMs" INTEGER,
ADD COLUMN     "perfScore" INTEGER,
ADD COLUMN     "ttfbMs" INTEGER;

-- AlterTable
ALTER TABLE "CrawlPage" ADD COLUMN     "issueCodes" TEXT[];
