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
