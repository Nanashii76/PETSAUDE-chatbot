-- Não adivinhar o canal de sessões históricas com identidade ambígua.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sessoes s JOIN interlocutores i ON i.identificador = s.profissional_id
             GROUP BY s.id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Identidades históricas ambíguas: reconciliar identificadores/canais antes da migração';
  END IF;
END $$;

ALTER TABLE sessoes ADD COLUMN canal varchar(20) NOT NULL DEFAULT 'web';
ALTER TABLE sessoes ADD COLUMN interlocutor_id uuid REFERENCES interlocutores(id) ON DELETE SET NULL;
UPDATE sessoes s SET interlocutor_id = i.id, canal = i.canal
FROM interlocutores i WHERE i.identificador = s.profissional_id;

-- Duplicatas ou valores inválidos abortam a transação, sem descartar casos clínicos.
CREATE UNIQUE INDEX uq_sessoes_ativa ON sessoes(canal, profissional_id) WHERE status = 'PENDENTE';
CREATE INDEX idx_sessoes_interlocutor ON sessoes(interlocutor_id) WHERE interlocutor_id IS NOT NULL;
CREATE INDEX idx_mensagens_sessao_ordem ON mensagens(sessao_id, criado_em, id);
CREATE INDEX idx_encaminhamentos_recentes ON encaminhamentos(criado_em DESC, id DESC);
CREATE INDEX idx_eventos_sessao ON eventos(sessao_id) WHERE sessao_id IS NOT NULL;
CREATE INDEX idx_eventos_interlocutor ON eventos(interlocutor_id) WHERE interlocutor_id IS NOT NULL;

-- Não existem consultas por conteúdo JSON: evitar custo de escrita e armazenamento dos GIN.
DROP INDEX idx_sessoes_dados_coletados;
DROP INDEX idx_encaminhamentos_dados_estruturados;
DROP INDEX idx_sessoes_status;
DROP INDEX idx_mensagens_sessao_id;

ALTER TABLE sessoes
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN agente_atual SET NOT NULL,
  ALTER COLUMN dados_coletados SET NOT NULL,
  ALTER COLUMN dados_pendentes SET NOT NULL,
  ALTER COLUMN criado_em SET NOT NULL,
  ALTER COLUMN atualizado_em SET NOT NULL,
  ADD CONSTRAINT sessoes_status_valido CHECK (status IN ('PENDENTE','FINALIZADO','NAO_ELEGIVEL','ABANDONADA')),
  ADD CONSTRAINT sessoes_canal_valido CHECK (canal IN ('web','whatsapp')),
  ADD CONSTRAINT sessoes_coletados_objeto CHECK (jsonb_typeof(dados_coletados) = 'object'),
  ADD CONSTRAINT sessoes_pendentes_array CHECK (jsonb_typeof(dados_pendentes) = 'array');
ALTER TABLE mensagens
  ALTER COLUMN criado_em SET NOT NULL,
  ADD CONSTRAINT mensagens_remetente_valido CHECK (remetente IN ('profissional','bot','system')),
  ADD CONSTRAINT mensagens_tokens_prompt_validos CHECK (tokens_prompt >= 0),
  ADD CONSTRAINT mensagens_tokens_resposta_validos CHECK (tokens_resposta >= 0);
ALTER TABLE encaminhamentos
  ALTER COLUMN criado_em SET NOT NULL,
  ALTER COLUMN dados_estruturados SET NOT NULL,
  ADD CONSTRAINT encaminhamentos_dados_objeto CHECK (jsonb_typeof(dados_estruturados) = 'object');
ALTER TABLE interlocutores
  ALTER COLUMN criado_em SET NOT NULL,
  ADD CONSTRAINT interlocutores_canal_valido CHECK (canal IN ('web','whatsapp'));
ALTER TABLE eventos
  ALTER COLUMN criado_em SET NOT NULL,
  ALTER COLUMN dados SET NOT NULL,
  ADD CONSTRAINT eventos_dados_objeto CHECK (jsonb_typeof(dados) = 'object'),
  ADD CONSTRAINT eventos_tipo_valido CHECK (tipo IN ('caso_iniciado','texto_gerado','nao_elegivel','urgencia'));
ALTER TABLE documentos_rag
  ALTER COLUMN criado_em SET NOT NULL,
  ALTER COLUMN campos_minimos SET NOT NULL,
  ADD CONSTRAINT documentos_campos_array CHECK (jsonb_typeof(campos_minimos) = 'array');

-- pgvector >= 0.8: ampliar a busca HNSW quando o filtro remove candidatos.
ALTER FUNCTION match_documentos(vector, varchar, int) SET hnsw.iterative_scan = 'strict_order';
