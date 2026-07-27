-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crawl" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'QUEUED',
    "startUrl" TEXT NOT NULL,
    "maxPages" INTEGER NOT NULL DEFAULT 1000,
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "healthScore" INTEGER,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "notices" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Crawl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlPage" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "title" TEXT,
    "titleLength" INTEGER,
    "metaDescription" TEXT,
    "metaLength" INTEGER,
    "h1Count" INTEGER,
    "wordCount" INTEGER,
    "imagesNoAlt" INTEGER,
    "internalLinks" INTEGER,
    "externalLinks" INTEGER,
    "canonical" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "loadMs" INTEGER,
    "issues" JSONB,
    "issueCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CrawlPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_orgId_idx" ON "Project"("orgId");

-- CreateIndex
CREATE INDEX "Crawl_projectId_idx" ON "Crawl"("projectId");

-- CreateIndex
CREATE INDEX "CrawlPage_crawlId_idx" ON "CrawlPage"("crawlId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crawl" ADD CONSTRAINT "Crawl_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
