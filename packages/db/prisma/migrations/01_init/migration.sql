CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum "UserRole"
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BD');

-- CreateEnum "SiteType"
CREATE TYPE "SiteType" AS ENUM ('NIC_GEP', 'CPPP', 'NPROCURE', 'IREPS', 'CUSTOM_HTML');

-- CreateEnum "TenderStatus"
CREATE TYPE "TenderStatus" AS ENUM ('OPEN', 'CLOSED', 'UNKNOWN');

-- CreateEnum "CrawlStatus"
CREATE TYPE "CrawlStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "refreshHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "type" "SiteType" NOT NULL DEFAULT 'CUSTOM_HTML',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "crawlIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "source_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceSiteId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTenderId" TEXT,
    "title" TEXT NOT NULL,
    "organization" TEXT,
    "summary" TEXT,
    "location" TEXT,
    "estimatedValue" TEXT,
    "publishedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "status" "TenderStatus" NOT NULL DEFAULT 'UNKNOWN',
    "searchText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_duplicates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canonicalTenderId" UUID NOT NULL,
    "duplicateTenderId" UUID NOT NULL,
    "reason" TEXT,
    CONSTRAINT "tender_duplicates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceSiteId" UUID NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorSample" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "source_sites_key_key" ON "source_sites"("key");
CREATE UNIQUE INDEX "tenders_sourceUrl_key" ON "tenders"("sourceUrl");
CREATE INDEX "tenders_sourceSiteId_deadlineAt_idx" ON "tenders"("sourceSiteId", "deadlineAt");
CREATE INDEX "tenders_sourceSiteId_publishedAt_idx" ON "tenders"("sourceSiteId", "publishedAt");
CREATE UNIQUE INDEX "tender_duplicates_canonicalTenderId_duplicateTenderId_key" ON "tender_duplicates"("canonicalTenderId", "duplicateTenderId");

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "source_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_duplicates" ADD CONSTRAINT "tender_duplicates_canonicalTenderId_fkey" FOREIGN KEY ("canonicalTenderId") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_duplicates" ADD CONSTRAINT "tender_duplicates_duplicateTenderId_fkey" FOREIGN KEY ("duplicateTenderId") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "source_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- pgvector: Add embedding column
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS embedding vector(384);

-- FTS: Add tsvector column
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS tsv tsvector;

-- GIN index on tsvector
CREATE INDEX IF NOT EXISTS tenders_tsv_idx ON tenders USING GIN(tsv);

-- HNSW index on embedding
CREATE INDEX IF NOT EXISTS tenders_embedding_idx ON tenders USING hnsw(embedding vector_cosine_ops);

-- Auto-update tsvector trigger
CREATE OR REPLACE FUNCTION tenders_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', COALESCE(NEW."searchText", ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenders_tsv_update ON tenders;
CREATE TRIGGER tenders_tsv_update
  BEFORE INSERT OR UPDATE OF "searchText" ON tenders
  FOR EACH ROW EXECUTE FUNCTION tenders_tsv_trigger();
