# Sistema de Apoio à Regulação Clínica (SUS-DF / SISREG)

Sistema inteligente de triagem e regulação de pacientes baseado em múltiplos agentes de IA, focado na validação de encaminhamentos médicos de acordo com as Notas Técnicas oficiais da SES-DF

## Arquitetura do Sistema

O projeto adota uma arquitetura desacoplada dividida em Frontend (SPA), Backend (API REST/Orquestrador) e Banco de Dados Relacional/Vetorial (PostgreSQL + pgvector).

```Plaintext
[ Frontend React ] ---> (POST /api/webhook) ---> [ Backend Express + TypeScript ]
                                                            |
                                               +------------+------------+
                                               |                         |
                                       [ OpenRouter LLM ]      [ Supabase PostgreSQL ]
                                       (Cascata de Modelos)    (Sessões, Histórico & RAG)
```

## Modelagem do Banco (supabase)

O banco de dados relacional e vetorial foi estruturado em quatro tabelas principais para garantir auditoria, persistência de estado e suporte a RAG:

![banco_image](/docs/assets/Modelo_banco.PNG)

- `sessoes`: Gerencia o estado atual da triagem por profissional.
    - `id` (UUID, PK): Identificador único da sessão.
    - `profissional_id` (Varchar): Identificador do profissional/médico.
    - `agente_atual` (Varchar): Especialidade ativa no momento (orquestrador, cardiologia, dermatologia, endocrinologia, duvidas_gerais).
    - `status` (Varchar): Estado da triagem (`PENDENTE`, `FINALIZADO`, `NAO_ELEGIVEL`).
    - `dados_coletados` (JSONB): Acúmulo de informações clínicas validadas.
    - `dados_pendentes` (JSONB): Faltas identificadas pelo agente.

- `mensagens`: Histórico completo de auditoria e telemetria.
    - `sessao_id` (UUID, FK): Relacionamento com a sessão.
    - `remetente` (`profissional`, `bot`, `system`).
    - `conteudo` (Text): Mensagem trocada.
    - `modelo_usado`, `tokens_prompt`, `tokens_resposta`: Telemetria de custos e uso da IA.

- `encaminhamentos`: Dados consolidados dos casos aprovados para o SISREG.

- `documentos_rag`: Base vetorial (pgvector) contendo os trechos das Notas Técnicas oficiais do SUS.

## Backend (API & Orquestrador)

O backend foi construído em Node.js com Express e TypeScript utilizando o padrão ESM (type: "module").

### Principais Tecnologias:

- Express: Roteamento e middleware HTTP.
- pg: Cliente nativo do PostgreSQL com suporte a pool de conexões.
- OpenRouter API: Camada de inteligência artificial com cascata de fallback automática para modelos gratuitos (`:free`).

### Estrutura de Pastas

```Plaintext
backend-regulacao/
├── src/
│   ├── api/
│   │   └── webhook.ts       # Controlador de entrada e validação de payload
│   ├── core/
│   │   ├── orchestrator.ts  # Máquina de estados e chaveamento de agentes
│   │   └── prompts.ts       # Repositório de personas e diretrizes das Notas Técnicas
│   ├── services/
│   │   ├── database.ts      # Repositório de dados (Queries SQL / Pool)
│   │   └── openrouter.ts    # Comunicação com IA e cascata de modelos
│   └── server.ts            # Ponto de entrada do Express (CORS & Health Check)
├── .env
├── package.json
└── tsconfig.json
```

## Frontend (Interface de Chat)

Desenvolvido em React + Vite, consumindo diretamente a API do backend por meio de requisições assíncronas (fetch) com renderização em Markdown para as respostas clínicas

### Principais Funcionalidades:

- Persistência de Sessão Local: Utiliza o localStorage para manter o identificador do usuário (chat_user_id).
- Optimistic UI: Exibição imediata da mensagem enviada pelo profissional de saúde.
- Formatação Avançada: Suporte a negrito, listas e blocos estruturados nas respostas do bot via react-markdown.

## Como Executar o Projeto

### Pré-requisitos

    Node.js instalado (v18+)
    Conta ativa no Supabase com a extensão pgvector habilitada
    Chave de API do OpenRouter

### Configuração do Backend

1. Clone o repositório e acesse a pasta do backend
2. Crie um arquivo `.env` na raiz com base no exemplo:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:[SENHA]@ [HOST]:6543/postgres
OPENROUTER_API_KEY=sk-or-v1-...
```
3. Instale as dependências e inicie o servidor de desenvolvimento:
```bash
npm install
npx tsx src/server.ts
```

### Configuração do Frontend

1. Acesse a pasta do frontend
2. Instale as dependências:
```
npm install
```
3. Inicie a aplicação Vite:
```
npm run dev
```