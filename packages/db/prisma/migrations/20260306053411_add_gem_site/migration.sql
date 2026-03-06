-- Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Re-create Full Text Search index (tsvector)
CREATE INDEX IF NOT EXISTS "tenders_tsv_idx"
ON "tenders"
USING GIN ("tsv");

-- Re-create Vector index (pgvector)
-- NOTE:
-- 1) This assumes cosine similarity usage (common). If you use L2/IP, change ops.
-- 2) For small datasets this won't matter much, but keeps prod-ready structure.
CREATE INDEX IF NOT EXISTS "tenders_embedding_idx"
ON "tenders"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100);

-- Restore DB-side UUID defaults (recommended)
-- This makes inserts safe even if some code path doesn't provide ids.
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "source_sites" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tenders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "tender_duplicates" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "crawl_runs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();