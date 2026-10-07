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
