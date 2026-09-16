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