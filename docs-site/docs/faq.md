# Perguntas Frequentes (FAQ)

### O que aconteceu com o n8n?
Nós evoluímos a arquitetura. O n8n foi um excelente MVP (Produto Mínimo Viável) para validar os
fluxos e a lógica de múltiplos agentes. No entanto, para escalar com mais controle de estado,
latência reduzida e tratamento rigoroso de JSON, migramos todo o fluxo para um backend Node.js
(TypeScript) no Render. Todo o histórico do n8n foi preservado na aba
[Histórico Legado](/legado-n8n/index).

### Quais modelos o OpenRouter utiliza?
Uma cascata de modelos gratuitos (`:free`), tentados em ordem até um responder com sucesso — veja
a lista atual e por que ela muda com frequência em [Modelos de IA](/modelos-ia).

### Como o RAG funciona hoje?
Busca vetorial de verdade: o texto das Notas Técnicas é dividido em chunks por condição clínica,
cada chunk vira um vetor via **Gemini** (`gemini-embedding-001`), e a busca por similaridade roda
direto no PostgreSQL (`pgvector`) via uma função SQL (`match_documentos`) — sem LangChain, sem
OpenAI. Veja o detalhamento completo em [RAG vetorial](/rag).

### Como as chaves de API estão protegidas?
O frontend (React SPA) **nunca** possui as chaves de API. Toda requisição é enviada ao webhook do
backend, que lê as chaves de variáveis de ambiente (`.env`) no Render: `DATABASE_URL`,
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, e as credenciais da Evolution API para o canal WhatsApp.

### O RAG é lento?
Não. A busca vetorial é otimizada pela extensão `pgvector` e índice `hnsw` no PostgreSQL
(Supabase), permitindo encontrar os trechos corretos em milissegundos antes de invocar o LLM.

### O sistema tem testes automatizados?
Sim — 27 testes via Vitest cobrindo a lógica pura (chunking, parsing de webhook, cascata de
fallback, orquestrador), mais um checklist manual para os fluxos que dependem do LLM/RAG de
verdade. Veja [Testes](/testes).
