-- Novos tipos de evento do painel (issue #7): busca RAG sem trecho de NT e os eventos da aba de
-- regulação. Continuam sendo só fatos de uso, sem texto de caso.
ALTER TABLE eventos DROP CONSTRAINT eventos_tipo_valido;
ALTER TABLE eventos ADD CONSTRAINT eventos_tipo_valido CHECK (tipo IN (
  'caso_iniciado','texto_gerado','nao_elegivel','urgencia',
  'rag_vazio','pedido_analisado','devolucao_redigida','consulta_criterio'
));
