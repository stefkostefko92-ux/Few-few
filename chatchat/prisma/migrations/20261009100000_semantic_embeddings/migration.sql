-- Семантично търсене (§6.2 „PostgreSQL + pgvector“, §8.1). Ръчна миграция: Prisma не познава
-- типа vector и HNSW индекса, затова колоната е Unsupported("vector(768)") в схемата.
-- CREATE EXTENSION иска суперпотребител (или предварително създадено разширение) — образът
-- pgvector/pgvector:pg16 с POSTGRES_USER го позволява; на чужд Postgres го създава DBA.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable: векторът на парчето и моделът, с който е смятан (смяна на модела → преизчисляване;
-- векторите на различни модели не са съвместими). NULL → парчето още не е индексирано.
ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" vector(768),
ADD COLUMN "embeddingModel" TEXT;

-- CreateIndex: HNSW по косинусово разстояние (оператор <=>).
CREATE INDEX "DocumentChunk_embedding_hnsw_idx" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
