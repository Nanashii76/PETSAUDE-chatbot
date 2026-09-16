-- Substitui o esquema fragmentado de RAG (documentos_rag genérico nunca populado
-- + notes_cardi/notes_derma/notes_endocri com 3 funções RPC redundantes) por um
-- esquema único, dimensionado para o embedding do Gemini (text-embedding-004, 768d)
-- em vez do embedding da OpenAI (1536d).

DROP FUNCTION IF EXISTS match_notes_cardi;
DROP FUNCTION IF EXISTS match_notes_derma;
DROP FUNCTION IF EXISTS match_notes_endocri;
DROP TABLE IF EXISTS documentos_rag CASCADE;
DROP TABLE IF EXISTS notes_cardi CASCADE;
DROP TABLE IF EXISTS notes_derma CASCADE;
DROP TABLE IF EXISTS notes_endocri CASCADE;

CREATE TABLE documentos_rag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    especialidade VARCHAR(50) NOT NULL,   -- cardiologia | dermatologia | endocrinologia
    titulo TEXT NOT NULL,                 -- ex: "Consulta em Cardiologia - Arritmia/Síncope"
    conteudo TEXT NOT NULL,
    embedding VECTOR(768) NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documentos_rag_especialidade ON documentos_rag(especialidade);
CREATE INDEX idx_documentos_rag_embedding ON documentos_rag USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION match_documentos(
  query_embedding vector(768),
  especialidade_filtro varchar(50),
  match_count int DEFAULT 4
) RETURNS TABLE (titulo text, conteudo text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT d.titulo, d.conteudo, 1 - (d.embedding <=> query_embedding) AS similarity
  FROM documentos_rag d
  WHERE d.especialidade = especialidade_filtro
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
