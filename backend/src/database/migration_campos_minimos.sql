-- Adiciona a lista de campos obrigatórios de cada condição clínica, extraída uma vez na ingestão
-- ("Conteúdo descritivo mínimo que o encaminhamento deve ter") em vez de o LLM ter que inferir
-- essa lista lendo o parágrafo da Nota Técnica de novo em todo turno da conversa.

ALTER TABLE documentos_rag ADD COLUMN IF NOT EXISTS campos_minimos JSONB DEFAULT '[]'::jsonb;

-- match_documentos precisa devolver a nova coluna. Postgres não deixa trocar o tipo de retorno
-- com CREATE OR REPLACE, então precisa derrubar a função antiga primeiro.
DROP FUNCTION IF EXISTS match_documentos(vector(768), varchar(50), int);

CREATE FUNCTION match_documentos(
  query_embedding vector(768),
  especialidade_filtro varchar(50),
  match_count int DEFAULT 4
) RETURNS TABLE (titulo text, conteudo text, campos_minimos jsonb, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT d.titulo, d.conteudo, d.campos_minimos, 1 - (d.embedding <=> query_embedding) AS similarity
  FROM documentos_rag d
  WHERE d.especialidade = especialidade_filtro
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Depois de rodar esta migration, repita a ingestão para popular campos_minimos nas linhas
-- existentes (o script já é idempotente — dá TRUNCATE antes de reinserir):
--   npx tsx src/scripts/ingestDocumentosRag.ts
