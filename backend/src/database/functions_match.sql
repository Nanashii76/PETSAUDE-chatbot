-- Função única de busca vetorial, filtrada por especialidade.
-- Substitui as antigas match_notes_cardi/match_notes_derma/match_notes_endocri
-- (uma tabela por especialidade), que foram unificadas na tabela documentos_rag.
CREATE OR REPLACE FUNCTION match_documentos (
  query_embedding vector(768),
  especialidade_filtro varchar(50),
  match_count int DEFAULT 4
) RETURNS TABLE (
  titulo text,
  conteudo text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documentos_rag.titulo,
    documentos_rag.conteudo,
    1 - (documentos_rag.embedding <=> query_embedding) AS similarity
  FROM documentos_rag
  WHERE documentos_rag.especialidade = especialidade_filtro
  ORDER BY documentos_rag.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
