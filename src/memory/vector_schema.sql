-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to entities table
ALTER TABLE entities 
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Add embedding column to observations table
ALTER TABLE observations 
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create vector indexes for similarity search
CREATE INDEX IF NOT EXISTS entities_embedding_idx ON entities 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS observations_embedding_idx ON observations 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create function for entity similarity search
CREATE OR REPLACE FUNCTION match_entities(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  name text,
  entity_type text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.entity_type,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM
    entities e
  WHERE
    e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY
    similarity DESC
  LIMIT match_count;
END;
$$;

-- Create function for observation similarity search
CREATE OR REPLACE FUNCTION match_observations(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.entity_id,
    o.content,
    1 - (o.embedding <=> query_embedding) AS similarity
  FROM
    observations o
  WHERE
    o.embedding IS NOT NULL
    AND 1 - (o.embedding <=> query_embedding) > match_threshold
  ORDER BY
    similarity DESC
  LIMIT match_count;
END;
$$;
