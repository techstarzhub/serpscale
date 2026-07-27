-- CreateEnum
CREATE TYPE "SerpJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD');

-- AlterEnum
ALTER TYPE "CrawlStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CLIENT';

-- DropIndex
DROP INDEX "Integration_ownerKey_provider_key";

-- AlterTable
ALTER TABLE "Crawl" ADD COLUMN     "linkGraph" JSONB,
ADD COLUMN     "pagespeed" JSONB;

-- AlterTable
ALTER TABLE "CrawlPage" ADD COLUMN     "inlinks" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "smtp" JSONB;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "paypalPlanId" TEXT,
ADD COLUMN     "stripePriceId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "gateway" TEXT,
ADD COLUMN     "gatewayCustomerId" TEXT,
ADD COLUMN     "gatewaySubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "clientOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customRoleId" TEXT;

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gateway" TEXT NOT NULL DEFAULT 'manual',
    "gatewayRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "type" TEXT NOT NULL DEFAULT 'CLIENT',
    "notes" TEXT,
    "branding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataCache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SerpCountry" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "googleDomain" TEXT,

    CONSTRAINT "SerpCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpLanguage" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SerpLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpDevice" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SerpDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpKeyword" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "countryId" INTEGER NOT NULL,
    "languageId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerpKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "keywordId" TEXT,
    "status" "SerpJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "error" TEXT,
    "snapshotId" TEXT,
    "idempotencyKey" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SerpJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpSnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "keywordId" TEXT,
    "query" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'google',
    "countryId" INTEGER NOT NULL,
    "languageId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "totalResults" BIGINT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerpSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpOrganicResult" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "snippet" TEXT,
    "sitelinks" JSONB,

    CONSTRAINT "SerpOrganicResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpFeatureRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "ownedByDomain" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "SerpFeatureRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpPeopleAlsoAsk" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "snippet" TEXT,
    "url" TEXT,

    CONSTRAINT "SerpPeopleAlsoAsk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpRelatedSearch" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "query" TEXT NOT NULL,

    CONSTRAINT "SerpRelatedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpAiOverview" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "citedDomains" TEXT[],

    CONSTRAINT "SerpAiOverview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpMetadata" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerLatencyMs" INTEGER,
    "totalOrganic" INTEGER NOT NULL,
    "featureTypes" TEXT[],
    "raw" JSONB NOT NULL,

    CONSTRAINT "SerpMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpHistory" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "position" INTEGER,
    "delta" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerpHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpCredit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerpCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpUsageLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "jobId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerpUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProjectAccess" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProjectAccess_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProjectClients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProjectClients_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "CustomRole_orgId_idx" ON "CustomRole"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_idx" ON "AuditLog"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_orgId_idx" ON "Transaction"("orgId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Client_orgId_idx" ON "Client"("orgId");

-- CreateIndex
CREATE INDEX "CopilotMessage_projectId_userId_createdAt_idx" ON "CopilotMessage"("projectId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SerpCountry_code_key" ON "SerpCountry"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SerpLanguage_code_key" ON "SerpLanguage"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SerpDevice_name_key" ON "SerpDevice"("name");

-- CreateIndex
CREATE INDEX "SerpKeyword_projectId_idx" ON "SerpKeyword"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SerpKeyword_projectId_normalized_countryId_languageId_devic_key" ON "SerpKeyword"("projectId", "normalized", "countryId", "languageId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SerpJob_idempotencyKey_key" ON "SerpJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SerpJob_orgId_status_idx" ON "SerpJob"("orgId", "status");

-- CreateIndex
CREATE INDEX "SerpJob_status_priority_idx" ON "SerpJob"("status", "priority");

-- CreateIndex
CREATE INDEX "SerpSnapshot_keywordId_fetchedAt_idx" ON "SerpSnapshot"("keywordId", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "SerpSnapshot_orgId_fetchedAt_idx" ON "SerpSnapshot"("orgId", "fetchedAt");

-- CreateIndex
CREATE INDEX "SerpSnapshot_contentHash_idx" ON "SerpSnapshot"("contentHash");

-- CreateIndex
CREATE INDEX "SerpOrganicResult_snapshotId_position_idx" ON "SerpOrganicResult"("snapshotId", "position");

-- CreateIndex
CREATE INDEX "SerpOrganicResult_domain_idx" ON "SerpOrganicResult"("domain");

-- CreateIndex
CREATE INDEX "SerpFeatureRow_snapshotId_type_idx" ON "SerpFeatureRow"("snapshotId", "type");

-- CreateIndex
CREATE INDEX "SerpPeopleAlsoAsk_snapshotId_idx" ON "SerpPeopleAlsoAsk"("snapshotId");

-- CreateIndex
CREATE INDEX "SerpRelatedSearch_snapshotId_idx" ON "SerpRelatedSearch"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "SerpAiOverview_snapshotId_key" ON "SerpAiOverview"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "SerpMetadata_snapshotId_key" ON "SerpMetadata"("snapshotId");

-- CreateIndex
CREATE INDEX "SerpHistory_keywordId_domain_fetchedAt_idx" ON "SerpHistory"("keywordId", "domain", "fetchedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SerpCredit_orgId_key" ON "SerpCredit"("orgId");

-- CreateIndex
CREATE INDEX "SerpUsageLog_orgId_createdAt_idx" ON "SerpUsageLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "_ProjectAccess_B_index" ON "_ProjectAccess"("B");

-- CreateIndex
CREATE INDEX "_ProjectClients_B_index" ON "_ProjectClients"("B");

-- CreateIndex
CREATE INDEX "Integration_ownerKey_idx" ON "Integration"("ownerKey");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_ownerKey_provider_accountEmail_key" ON "Integration"("ownerKey", "provider", "accountEmail");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpKeyword" ADD CONSTRAINT "SerpKeyword_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpKeyword" ADD CONSTRAINT "SerpKeyword_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "SerpCountry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpKeyword" ADD CONSTRAINT "SerpKeyword_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "SerpLanguage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpKeyword" ADD CONSTRAINT "SerpKeyword_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SerpDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpJob" ADD CONSTRAINT "SerpJob_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "SerpKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpJob" ADD CONSTRAINT "SerpJob_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpSnapshot" ADD CONSTRAINT "SerpSnapshot_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "SerpKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpSnapshot" ADD CONSTRAINT "SerpSnapshot_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "SerpCountry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpSnapshot" ADD CONSTRAINT "SerpSnapshot_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "SerpLanguage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpSnapshot" ADD CONSTRAINT "SerpSnapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SerpDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpOrganicResult" ADD CONSTRAINT "SerpOrganicResult_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpFeatureRow" ADD CONSTRAINT "SerpFeatureRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpPeopleAlsoAsk" ADD CONSTRAINT "SerpPeopleAlsoAsk_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpRelatedSearch" ADD CONSTRAINT "SerpRelatedSearch_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpAiOverview" ADD CONSTRAINT "SerpAiOverview_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpMetadata" ADD CONSTRAINT "SerpMetadata_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpHistory" ADD CONSTRAINT "SerpHistory_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "SerpKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpHistory" ADD CONSTRAINT "SerpHistory_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SerpSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectAccess" ADD CONSTRAINT "_ProjectAccess_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectAccess" ADD CONSTRAINT "_ProjectAccess_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectClients" ADD CONSTRAINT "_ProjectClients_A_fkey" FOREIGN KEY ("A") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectClients" ADD CONSTRAINT "_ProjectClients_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

