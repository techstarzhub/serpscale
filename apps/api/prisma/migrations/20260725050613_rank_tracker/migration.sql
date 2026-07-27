-- CreateTable
CREATE TABLE "RankKeyword" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "RankKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankCheck" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "position" INTEGER,
    "url" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankKeyword_projectId_idx" ON "RankKeyword"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RankKeyword_projectId_keyword_country_device_key" ON "RankKeyword"("projectId", "keyword", "country", "device");

-- CreateIndex
CREATE INDEX "RankCheck_keywordId_checkedAt_idx" ON "RankCheck"("keywordId", "checkedAt");

-- AddForeignKey
ALTER TABLE "RankKeyword" ADD CONSTRAINT "RankKeyword_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankCheck" ADD CONSTRAINT "RankCheck_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "RankKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
