
# Manutenção

## O que é “configuração” neste projeto

Há duas frentes principais:

1. **Frontend** (este repositório): UI do chat + contrato HTTP.
2. **Workflow no n8n**: lógica de roteamento, agentes, memórias, RAG e formatação de saída.

O export do workflow versionado está em [n8n.json](./n8n.json).

## Checklist de manutenção do workflow (n8n)

### 1) Webhook e contrato

- garantir que o Webhook está com método `POST`;
- confirmar que o frontend continua enviando `{ so, user, content, timestamp }`;
- se mudar nomes, ajustar o node **Edit Fields** (Set) e os prompts que referenciam `body.content`.

### 2) Roteador (Router)

- node **AI Agent** deve continuar retornando uma das intenções esperadas;
- se incluir/remover especialidades, atualizar:
	- prompt do roteador
	- regras do **Switch**
	- conexões para os agentes

### 3) Agentes especialistas

- manter o output em JSON estrito para não quebrar o node **Code in JavaScript**;
- manter a regra “uma pergunta por vez” quando `PENDENTE`;
- manter consistência de chaves:
	- `status`
	- `texto_resposta`
	- `dados_pendentes`, `dados_coletados_ate_o_momento`
	- `encaminhamento_sisreg`, `especialidade`, `classificacao_de_risco`, `dados_estruturados`, `fontes_consultadas`

### 4) Memória (Supabase Postgres)

- os nodes `memoryPostgresChat` usam a chave de sessão baseada em `body.user`.
- para “resetar” a conversa de um usuário:
	- no frontend: limpar `localStorage` (chave `chat_user_id`), ou
	- no n8n: limpar registros associados à sessão (dependendo do node/credencial).

### 5) Normalização do JSON (Code)

- se mudar o formato de saída dos agentes, ajustar o mapeamento no node **Code in JavaScript**.
- evitar que os agentes retornem texto fora do JSON; se ocorrer, o node tenta extrair o trecho entre `{` e `}`.

## Checklist de manutenção do frontend

- validar `.env` com `VITE_N8N_WEBHOOK_URL`;
- verificar CORS no endpoint do n8n (principalmente em produção);
- manter o parse da resposta: o frontend usa `data.output`.

## Segurança (recomendado)

- nunca versionar senhas/tokens em documentação;
- preferir credenciais via variáveis de ambiente/secret manager do n8n;
- rotacionar chaves da OpenAI e do Supabase caso tenham sido expostas.

