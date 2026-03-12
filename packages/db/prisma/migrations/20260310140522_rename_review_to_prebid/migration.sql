/*
  Warnings:

  - The values [REVIEW_MEETING] on the enum `TenderWorkflowStage` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TenderWorkflowStage_new" AS ENUM ('TENDER_IDENTIFICATION', 'DUE_DILIGENCE', 'PRE_BID_MEETING', 'TENDER_FILING', 'TECH_EVALUATION', 'PRESENTATION_STAGE', 'FINANCIAL_EVALUATION', 'CONTRACT_AWARD', 'PROJECT_INITIATED', 'PROJECT_COMPLETED', 'REJECTED');
ALTER TABLE "public"."tender_workflows" ALTER COLUMN "current_stage" DROP DEFAULT;
ALTER TABLE "tender_workflows" ALTER COLUMN "current_stage" TYPE "TenderWorkflowStage_new" USING ("current_stage"::text::"TenderWorkflowStage_new");
ALTER TABLE "tender_workflows" ALTER COLUMN "failed_at_stage" TYPE "TenderWorkflowStage_new" USING ("failed_at_stage"::text::"TenderWorkflowStage_new");
ALTER TABLE "tender_stage_assignments" ALTER COLUMN "stage" TYPE "TenderWorkflowStage_new" USING ("stage"::text::"TenderWorkflowStage_new");
ALTER TABLE "tender_activity_logs" ALTER COLUMN "stage" TYPE "TenderWorkflowStage_new" USING ("stage"::text::"TenderWorkflowStage_new");
ALTER TABLE "productivity_score_rules" ALTER COLUMN "stage" TYPE "TenderWorkflowStage_new" USING ("stage"::text::"TenderWorkflowStage_new");
ALTER TYPE "TenderWorkflowStage" RENAME TO "TenderWorkflowStage_old";
ALTER TYPE "TenderWorkflowStage_new" RENAME TO "TenderWorkflowStage";
DROP TYPE "public"."TenderWorkflowStage_old";
ALTER TABLE "tender_workflows" ALTER COLUMN "current_stage" SET DEFAULT 'TENDER_IDENTIFICATION';
COMMIT;
