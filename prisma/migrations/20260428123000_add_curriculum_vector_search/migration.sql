-- Habilita extensoes necessarias para vetores e UUID.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Base para armazenamento de trechos curriculares com embeddings.
CREATE TABLE IF NOT EXISTS "CurriculumChunk" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course TEXT NOT NULL,
  semester TEXT,
  discipline TEXT,
  content TEXT NOT NULL,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS curriculum_chunk_course_idx
  ON "CurriculumChunk" (course);

CREATE INDEX IF NOT EXISTS curriculum_chunk_created_at_idx
  ON "CurriculumChunk" (created_at DESC);

-- Indice vetorial para busca por similaridade.
CREATE INDEX IF NOT EXISTS curriculum_chunk_embedding_idx
  ON "CurriculumChunk"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RPC para recuperar contexto curricular por similaridade.
CREATE OR REPLACE FUNCTION match_curriculum_context(
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5,
  min_similarity DOUBLE PRECISION DEFAULT 0.55,
  filter_course TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  course TEXT,
  semester TEXT,
  discipline TEXT,
  content TEXT,
  source TEXT,
  metadata JSONB,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    c.id,
    c.course,
    c.semester,
    c.discipline,
    c.content,
    c.source,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM "CurriculumChunk" c
  WHERE (filter_course IS NULL OR c.course = filter_course)
    AND (1 - (c.embedding <=> query_embedding)) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;