# Arquitetura do sistema

## Visão geral

O chatbot de regulação em saúde foi projetado para apoiar profissionais de saúde no envio de informações clínicas e no processo de encaminhamento, utilizando um fluxo conversacional organizado no **n8n**.

Na versão atual, o sistema está estruturado de forma **simplificada**, com foco em uma única especialidade por fluxo, permitindo fácil compreensão, manutenção e evolução futura.

A arquitetura do sistema pode ser entendida em duas partes principais:

1. **Parte visível ao usuário** — a interface de chat;
2. **Parte interna do processamento** — o fluxo que recebe, organiza, processa e devolve a resposta.

---

## Componentes principais

## 1. Frontend (interface de chat)

É a parte que o usuário enxerga e utiliza.

Sua função é:

- gerar/armazenar um identificador estável (`chat_user_id`) no `localStorage`;
- coletar metadados simples (SO e timestamp);
- enviar a mensagem ao webhook do n8n;
- renderizar a resposta (com suporte a Markdown).

Payload enviado (no body do `POST`):

```json
{
	"so": "Windows|MacOS|Linux|Android|iOS|Desconhecido",
	"user": "user_xxxxx",
	"content": "texto da mensagem",
	"timestamp": "2026-03-24T20:06:14.460Z"
}
```

### 2) n8n (orquestração)

O workflow principal recebe o payload via Webhook e segue este padrão:

- normaliza campos (node **Edit Fields**);
- classifica intenção com um agente roteador (**AI Agent**);
- direciona para o agente especialista via **Switch**;
- consulta documentos via ferramentas RAG (Vector Store) quando aplicável;
- tenta converter a saída do agente para um JSON padrão (node **Code in JavaScript**);
- devolve resposta ao frontend via **Respond to Webhook**.

Especialidades atualmente roteadas no workflow:

- Cardiologia
- Dermatologia
- Endocrinologia
- Dúvidas gerais (agente orquestrador)

### 3) Memória conversacional (Supabase Postgres)

O workflow usa nodes `memoryPostgresChat` por agente.

- A chave de sessão é o usuário recebido do frontend (derivado de `chat_user_id`).
- Isso permite continuidade entre mensagens para o mesmo usuário.

### 4) RAG / Vector Store (Supabase)

O workflow utiliza nodes `vectorStoreSupabase` e `toolVectorStore`.

- Embeddings: OpenAI Embeddings.
- Consulta: função SQL (queryName) configurada no node (ex.: `match_documents`, `match_notes_endocri`).

Detalhes em: `docs/rag.md`.

## Diagrama (alto nível)

```mermaid
flowchart LR
	FE[Frontend (Vite+React)] -->|POST /webhook| WH[Webhook (n8n)]
	WH --> SET[Edit Fields]
	SET --> RT[AI Agent (Router)]
	RT --> SW{Switch}
	SW -->|cardiologia| C[AI Agent1 (Cardio)]
	SW -->|dermatologia| D[AI Agent2 (Derma)]
	SW -->|endocrinologia| E[AI Agent4 (Endo)]
	SW -->|duvidas_gerais| G[AI Agent3 (Geral)]
	C --> CODE[Code: normaliza JSON]
	D --> CODE
	E --> CODE
	G --> CODE
	CODE --> IF{status == PENDENTE?}
	IF -->|sim| RESP1[Respond to Webhook]
	IF -->|não| RESP2[Respond to Webhook1]
	RESP1 --> FE
	RESP2 --> FE
```

## Resposta ao frontend

O frontend espera um JSON com a chave `output`:

```json
{ "output": "texto para exibir no chat" }
```

O texto pode conter Markdown.