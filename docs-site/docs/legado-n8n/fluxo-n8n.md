# Fluxo no n8n

## Visão geral

O fluxo principal do chatbot foi construído no **n8n** e organiza o caminho percorrido pela mensagem desde o momento em que ela é enviada pelo usuário até o retorno da resposta no chat.

O workflow atual é **multiagente**, com um **roteador de intenções** que direciona a conversa para um agente especialista (Cardiologia, Dermatologia, Endocrinologia) ou para um agente geral (Dúvidas gerais).

---

## Objetivo do fluxo

O objetivo do workflow principal é:

- receber a mensagem enviada pelo usuário;
- organizar os dados recebidos;
- enviar a pergunta para o agente principal;
- utilizar o contexto da conversa, quando necessário;
- tratar a saída da resposta;
- devolver a resposta final ao frontend.

---

## Etapas do fluxo

### 1) Entrada (Webhook)

- Node: **Webhook**
- Método: `POST`
- Recebe o payload do frontend no `body` (o n8n expõe isso como `$json.body`).

Campos esperados:

- `body.user` (id do usuário/sessão)
- `body.content` (texto da mensagem)
- `body.so` (sistema operacional)
- `body.timestamp` (ISO timestamp)

### 2) Normalização de campos (Set)

- Node: **Edit Fields**

Padroniza a entrada para o restante do workflow usando os mesmos nomes sob `body.*`.

### 3) Roteamento de intenção (Agente roteador)

- Node: **AI Agent**

Função: classificar o texto do usuário em exatamente uma intenção:

- `cardiologia`
- `dermatologia`
- `endocrinologia`
- `duvidas_gerais`

Observação: o Switch atual compara o output com strings contendo aspas (ex.: `"cardiologia"`). Isso reflete como o agente está configurado hoje.

### 4) Switch (ramificação por especialidade)

- Node: **Switch**

Direciona para um dos agentes especialistas:

- Cardiologia → **AI Agent1**
- Dermatologia → **AI Agent2**
- Endocrinologia → **AI Agent4**
- Dúvidas gerais → **AI Agent3**

Cada agente possui:

- um prompt de sistema com regras e formato de saída;
- memória conversacional em Postgres (nodes `Postgres Chat Memory*`);
- ferramenta RAG (Vector Store) quando aplicável.

### 5) Normalização da saída (Code in JavaScript)

- Node: **Code in JavaScript**

Objetivo: proteger o workflow contra respostas em formato inesperado.

O que ele faz:

1. remove blocos ```json ... ``` caso existam;
2. tenta isolar o trecho entre o primeiro `{` e o último `}`;
3. faz `JSON.parse`;
4. mapeia chaves para um formato padrão no item:

- `status` (default: `PENDENTE`)
- `texto_resposta`
- quando `PENDENTE`: `dados_pendentes`, `dados_coletados`
- quando `FINALIZADO`: `encaminhamento_sisreg`, `especialidade`, `classificacao_de_risco`, `dados_estruturados`, `fontes_consultadas`

Se o parse falhar, o node faz fallback:

- `status = PENDENTE`
- `texto_resposta = output bruto do agente`
- `is_json_valid = false` + `error`

### 6) Condicional e resposta ao frontend

- Node: **If** (verifica `status == PENDENTE`)
- Nodes finais: **Respond to Webhook** / **Respond to Webhook1**

Ambos respondem no formato:

```json
{ "output": "..." }
```

## Resumo do caminho da mensagem

**Frontend → Webhook → Edit Fields → AI Agent (Router) → Switch → Agente especialista → Code (normaliza JSON) → If → Respond to Webhook**