-- 1. Habilitar a extensão pgvector para o RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabela: sessoes (Controle de Estado)
CREATE TABLE sessoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id VARCHAR(255) NOT NULL,
    agente_atual VARCHAR(50) DEFAULT 'orquestrador',
    status VARCHAR(20) DEFAULT 'PENDENTE',
    dados_coletados JSONB DEFAULT '{}'::jsonb,
    dados_pendentes JSONB DEFAULT '[]'::jsonb,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela: mensagens (Histórico e Telemetria)
CREATE TABLE mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id UUID NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
    remetente VARCHAR(20) NOT NULL,
    conteudo TEXT NOT NULL,
    modelo_usado VARCHAR(100),
    tokens_prompt INT,
    tokens_resposta INT,
    fontes_rag JSONB,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela: encaminhamentos (O Produto Final)
CREATE TABLE encaminhamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id UUID NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
    especialidade VARCHAR(100) NOT NULL,
    classificacao_risco VARCHAR(50),
    resumo_sisreg TEXT,
    dados_estruturados JSONB DEFAULT '{}'::jsonb,
    elegivel BOOLEAN NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabela: documentos_rag (Base de Conhecimento Vetorial)
-- Uma linha por trecho (chunk) de Nota Técnica, já filtrável por especialidade.
-- 768 é a dimensão do embedding do Gemini (text-embedding-004, ver src/services/embeddings.ts).
CREATE TABLE documentos_rag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    especialidade VARCHAR(50) NOT NULL,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    -- Lista de campos obrigatórios ("Conteúdo descritivo mínimo..."), extraída uma vez na
    -- ingestão para o LLM não precisar inferir isso de novo a cada turno.
    campos_minimos JSONB DEFAULT '[]'::jsonb,
    embedding VECTOR(768) NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- ÍNDICES DE PERFORMANCE (O SEGREDO DA VELOCIDADE)
-- ==========================================

-- Índices B-Tree comuns para chaves estrangeiras e buscas exatas
CREATE INDEX idx_sessoes_profissional_id ON sessoes(profissional_id);
CREATE INDEX idx_sessoes_status ON sessoes(status);
CREATE INDEX idx_mensagens_sessao_id ON mensagens(sessao_id);
CREATE INDEX idx_encaminhamentos_sessao_id ON encaminhamentos(sessao_id);

-- Índices GIN para JSONB (Permite buscar dados específicos DENTRO do JSON instantaneamente)
CREATE INDEX idx_sessoes_dados_coletados ON sessoes USING GIN (dados_coletados);
CREATE INDEX idx_encaminhamentos_dados_estruturados ON encaminhamentos USING GIN (dados_estruturados);
CREATE INDEX idx_documentos_rag_especialidade ON documentos_rag(especialidade);

-- Índice HNSW para busca vetorial de altíssima performance no RAG
-- Usa a métrica de "distância de cosseno" (vector_cosine_ops), que é a ideal para textos e LLMs.
CREATE INDEX idx_documentos_rag_embedding ON documentos_rag USING hnsw (embedding vector_cosine_ops);


-- ==========================================
-- TRIGGERS E FUNÇÕES AUTOMÁTICAS
-- ==========================================

-- Função para atualizar automaticamente a coluna atualizado_em
CREATE OR REPLACE FUNCTION update_atualizado_em_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Gatilho para a tabela de sessões
CREATE TRIGGER update_sessoes_atualizado_em
    BEFORE UPDATE ON sessoes
    FOR EACH ROW
    EXECUTE FUNCTION update_atualizado_em_column();
-- Identidade do profissional que conversa: nome e unidade de saúde onde atua, pedidos uma vez antes
-- do chat (canal "web") ou capturados automaticamente do contato (canal "whatsapp", pushName). Não
-- é um cadastro/login: profissional_id (telefone ou id gerado no navegador) continua sendo a chave
-- usada em sessoes — esta tabela só guarda o perfil associado a essa chave.

CREATE TABLE interlocutores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canal VARCHAR(20) NOT NULL,
    identificador VARCHAR(255) NOT NULL,
    nome VARCHAR(120),
    unidade_cnes VARCHAR(20),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (canal, identificador)
);

CREATE INDEX idx_interlocutores_identificador ON interlocutores(identificador);

-- Fatos de uso para o painel, sem texto de caso — nunca grava dados_coletados nem o conteúdo das
-- mensagens, só o fato (tipo, especialidade, cor de risco quando houver). Mesmo espírito da tabela
-- "eventos" do projeto irmão chatbot2: permite montar métricas de uso sem expor conteúdo clínico.

CREATE TABLE eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(30) NOT NULL,              -- caso_iniciado | texto_gerado | nao_elegivel | urgencia
    especialidade VARCHAR(50),
    sessao_id UUID REFERENCES sessoes(id) ON DELETE SET NULL,
    interlocutor_id UUID REFERENCES interlocutores(id) ON DELETE SET NULL,
    dados JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_eventos_tipo ON eventos(tipo);
CREATE INDEX idx_eventos_especialidade ON eventos(especialidade);
CREATE INDEX idx_eventos_criado_em ON eventos(criado_em);

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
  campos_minimos jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documentos_rag.titulo,
    documentos_rag.conteudo,
    documentos_rag.campos_minimos,
    1 - (documentos_rag.embedding <=> query_embedding) AS similarity
  FROM documentos_rag
  WHERE documentos_rag.especialidade = especialidade_filtro
  ORDER BY documentos_rag.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
