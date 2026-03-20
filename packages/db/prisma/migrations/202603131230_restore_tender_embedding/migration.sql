CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "tenders"
ADD COLUMN IF NOT EXISTS "embedding" vector(384);

DROP INDEX IF EXISTS "tenders_embedding_idx";

CREATE INDEX IF NOT EXISTS "tenders_embedding_idx"
ON "tenders"
USING hnsw ("embedding" vector_cosine_ops);
