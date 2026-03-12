/*
  Warnings:

  - You are about to drop the column `createdAt` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `endedAt` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `errorCount` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `errorSample` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `itemsFound` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `itemsNew` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `itemsUpdated` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `sourceSiteId` on the `crawl_runs` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `crawl_runs` table. All the data in the column will be lost.
  - The `status` column on the `crawl_runs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `baseUrl` on the `source_sites` table. All the data in the column will be lost.
  - You are about to drop the column `crawlIntervalMinutes` on the `source_sites` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `source_sites` table. All the data in the column will be lost.
  - You are about to drop the column `rateLimitPerMinute` on the `source_sites` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `source_sites` table. All the data in the column will be lost.
  - The `type` column on the `source_sites` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `canonicalTenderId` on the `tender_duplicates` table. All the data in the column will be lost.
  - You are about to drop the column `duplicateTenderId` on the `tender_duplicates` table. All the data in the column will be lost.
  - You are about to drop the column `contentHash` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `deadlineAt` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `embedding` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedValue` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `fetchedAt` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAt` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `searchText` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `sourceSiteId` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `sourceTenderId` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `sourceUrl` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `tsv` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `tenders` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `refreshHash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[canonical_tender_id,duplicate_tender_id]` on the table `tender_duplicates` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[source_url]` on the table `tenders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `source_site_id` to the `crawl_runs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `base_url` to the `source_sites` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `source_sites` table without a default value. This is not possible if the table is not empty.
  - Added the required column `canonical_tender_id` to the `tender_duplicates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `duplicate_tender_id` to the `tender_duplicates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source_site_id` to the `tenders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source_url` to the `tenders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `tenders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
DROP TRIGGER IF EXISTS tenders_tsv_update ON tenders CASCADE;
CREATE TYPE "TenderWorkflowStage" AS ENUM ('TENDER_IDENTIFICATION', 'DUE_DILIGENCE', 'REVIEW_MEETING', 'TENDER_FILING', 'TECH_EVALUATION', 'PRESENTATION_STAGE', 'FINANCIAL_EVALUATION', 'CONTRACT_AWARD', 'PROJECT_INITIATED', 'PROJECT_COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StageAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityActionType" AS ENUM ('WORKFLOW_ENTERED', 'STAGE_ASSIGNED', 'STAGE_REASSIGNED', 'STAGE_STARTED', 'STAGE_COMPLETED', 'STAGE_CHANGED', 'TENDER_REJECTED', 'NOTE_ADDED', 'TENDER_VIEWED', 'SEARCH_PERFORMED', 'REPORT_GENERATED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReportRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- AlterEnum
ALTER TYPE "SiteType" ADD VALUE 'GEM';

-- DropForeignKey
ALTER TABLE "crawl_runs" DROP CONSTRAINT "crawl_runs_sourceSiteId_fkey";

-- DropForeignKey
ALTER TABLE "tender_duplicates" DROP CONSTRAINT "tender_duplicates_canonicalTenderId_fkey";

-- DropForeignKey
ALTER TABLE "tender_duplicates" DROP CONSTRAINT "tender_duplicates_duplicateTenderId_fkey";

-- DropForeignKey
ALTER TABLE "tenders" DROP CONSTRAINT "tenders_sourceSiteId_fkey";

-- DropIndex
DROP INDEX "tender_duplicates_canonicalTenderId_duplicateTenderId_key";

-- DropIndex
DROP INDEX "tenders_embedding_idx";

-- DropIndex
DROP INDEX "tenders_sourceSiteId_deadlineAt_idx";

-- DropIndex
DROP INDEX "tenders_sourceSiteId_publishedAt_idx";

-- DropIndex
DROP INDEX "tenders_sourceUrl_key";

-- DropIndex
DROP INDEX "tenders_tsv_idx";

-- AlterTable
ALTER TABLE "crawl_runs" DROP COLUMN "createdAt",
DROP COLUMN "endedAt",
DROP COLUMN "errorCount",
DROP COLUMN "errorSample",
DROP COLUMN "itemsFound",
DROP COLUMN "itemsNew",
DROP COLUMN "itemsUpdated",
DROP COLUMN "sourceSiteId",
DROP COLUMN "startedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "error_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error_sample" TEXT,
ADD COLUMN     "items_found" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "items_new" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "items_updated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source_site_id" UUID NOT NULL,
ADD COLUMN     "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'QUEUED';

-- AlterTable
ALTER TABLE "source_sites" DROP COLUMN "baseUrl",
DROP COLUMN "crawlIntervalMinutes",
DROP COLUMN "createdAt",
DROP COLUMN "rateLimitPerMinute",
DROP COLUMN "updatedAt",
ADD COLUMN     "base_url" TEXT NOT NULL,
ADD COLUMN     "crawl_interval_minutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'NIC_GEP';

-- AlterTable
ALTER TABLE "tender_duplicates" DROP COLUMN "canonicalTenderId",
DROP COLUMN "duplicateTenderId",
ADD COLUMN     "canonical_tender_id" UUID NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "duplicate_tender_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "tenders" DROP COLUMN "contentHash",
DROP COLUMN "createdAt",
DROP COLUMN "deadlineAt",
DROP COLUMN "embedding",
DROP COLUMN "estimatedValue",
DROP COLUMN "fetchedAt",
DROP COLUMN "publishedAt",
DROP COLUMN "searchText",
DROP COLUMN "sourceSiteId",
DROP COLUMN "sourceTenderId",
DROP COLUMN "sourceUrl",
DROP COLUMN "tsv",
DROP COLUMN "updatedAt",
ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deadline_at" TIMESTAMP(3),
ADD COLUMN     "estimated_value" TEXT,
ADD COLUMN     "fetched_at" TIMESTAMP(3),
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "search_text" TEXT,
ADD COLUMN     "source_site_id" UUID NOT NULL,
ADD COLUMN     "source_tender_id" TEXT,
ADD COLUMN     "source_url" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "createdAt",
DROP COLUMN "isActive",
DROP COLUMN "passwordHash",
DROP COLUMN "refreshHash",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "refresh_hash" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "designation" TEXT,
    "team_name" TEXT,
    "manager_user_id" UUID,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id" UUID NOT NULL,
    "current_stage" "TenderWorkflowStage" NOT NULL DEFAULT 'TENDER_IDENTIFICATION',
    "is_rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "failed_at_stage" "TenderWorkflowStage",
    "entered_workflow_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_by_user_id" UUID NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_stage_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id" UUID NOT NULL,
    "stage" "TenderWorkflowStage" NOT NULL,
    "assigned_user_id" UUID NOT NULL,
    "assigned_by_user_id" UUID,
    "assignment_status" "StageAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completion_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_stage_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action_type" "ActivityActionType" NOT NULL,
    "stage" "TenderWorkflowStage",
    "from_value" TEXT,
    "to_value" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tender_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "note_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_score_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action_type" "ActivityActionType" NOT NULL,
    "stage" "TenderWorkflowStage",
    "score_value" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productivity_score_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_productivity_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "stat_date" DATE NOT NULL,
    "total_actions" INTEGER NOT NULL DEFAULT 0,
    "weighted_score" INTEGER NOT NULL DEFAULT 0,
    "tenders_touched" INTEGER NOT NULL DEFAULT 0,
    "stages_completed" INTEGER NOT NULL DEFAULT 0,
    "rejections_handled" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_productivity_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_type" "ReportType" NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_type" "ReportType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "ReportRunStatus" NOT NULL DEFAULT 'QUEUED',
    "generated_at" TIMESTAMP(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "error_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tender_workflows_tender_id_key" ON "tender_workflows"("tender_id");

-- CreateIndex
CREATE INDEX "tender_workflows_current_stage_is_rejected_idx" ON "tender_workflows"("current_stage", "is_rejected");

-- CreateIndex
CREATE INDEX "tender_workflows_last_updated_at_idx" ON "tender_workflows"("last_updated_at");

-- CreateIndex
CREATE INDEX "tender_stage_assignments_tender_id_stage_idx" ON "tender_stage_assignments"("tender_id", "stage");

-- CreateIndex
CREATE INDEX "tender_stage_assignments_assigned_user_id_assignment_status_idx" ON "tender_stage_assignments"("assigned_user_id", "assignment_status");

-- CreateIndex
CREATE INDEX "tender_activity_logs_tender_id_created_at_idx" ON "tender_activity_logs"("tender_id", "created_at");

-- CreateIndex
CREATE INDEX "tender_activity_logs_user_id_created_at_idx" ON "tender_activity_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "tender_notes_tender_id_created_at_idx" ON "tender_notes"("tender_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_productivity_daily_user_id_stat_date_key" ON "user_productivity_daily"("user_id", "stat_date");

-- CreateIndex
CREATE INDEX "crawl_runs_source_site_id_status_idx" ON "crawl_runs"("source_site_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tender_duplicates_canonical_tender_id_duplicate_tender_id_key" ON "tender_duplicates"("canonical_tender_id", "duplicate_tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenders_source_url_key" ON "tenders"("source_url");

-- CreateIndex
CREATE INDEX "tenders_source_site_id_idx" ON "tenders"("source_site_id");

-- CreateIndex
CREATE INDEX "tenders_status_idx" ON "tenders"("status");

-- CreateIndex
CREATE INDEX "tenders_published_at_idx" ON "tenders"("published_at");

-- CreateIndex
CREATE INDEX "tenders_deadline_at_idx" ON "tenders"("deadline_at");

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_source_site_id_fkey" FOREIGN KEY ("source_site_id") REFERENCES "source_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_duplicates" ADD CONSTRAINT "tender_duplicates_canonical_tender_id_fkey" FOREIGN KEY ("canonical_tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_duplicates" ADD CONSTRAINT "tender_duplicates_duplicate_tender_id_fkey" FOREIGN KEY ("duplicate_tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_site_id_fkey" FOREIGN KEY ("source_site_id") REFERENCES "source_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_workflows" ADD CONSTRAINT "tender_workflows_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_workflows" ADD CONSTRAINT "tender_workflows_last_updated_by_user_id_fkey" FOREIGN KEY ("last_updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_stage_assignments" ADD CONSTRAINT "tender_stage_assignments_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_stage_assignments" ADD CONSTRAINT "tender_stage_assignments_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_stage_assignments" ADD CONSTRAINT "tender_stage_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_activity_logs" ADD CONSTRAINT "tender_activity_logs_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_activity_logs" ADD CONSTRAINT "tender_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_notes" ADD CONSTRAINT "tender_notes_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_notes" ADD CONSTRAINT "tender_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_productivity_daily" ADD CONSTRAINT "user_productivity_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
