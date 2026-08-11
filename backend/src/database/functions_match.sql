-- 1. Função de busca para Cardiologia
CREATE OR REPLACE FUNCTION match_notes_cardi (
  query_embedding vector(1536),
  match_count int DEFAULT null,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    notes_cardi.id,
    notes_cardi.content,
    notes_cardi.metadata,
    1 - (notes_cardi.embedding <=> query_embedding) AS similarity
  FROM notes_cardi
  ORDER BY notes_cardi.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 2. Função de busca para Dermatologia
CREATE OR REPLACE FUNCTION match_notes_derma (
  query_embedding vector(1536),
  match_count int DEFAULT null,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    notes_derma.id,
    notes_derma.content,
    notes_derma.metadata,
    1 - (notes_derma.embedding <=> query_embedding) AS similarity
  FROM notes_derma
  ORDER BY notes_derma.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 3. Função de busca para Endocrinologia
CREATE OR REPLACE FUNCTION match_notes_endocri (
  query_embedding vector(1536),
  match_count int DEFAULT null,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    notes_endocri.id,
    notes_endocri.content,
    notes_endocri.metadata,
    1 - (notes_endocri.embedding <=> query_embedding) AS similarity
  FROM notes_endocri
  ORDER BY notes_endocri.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;