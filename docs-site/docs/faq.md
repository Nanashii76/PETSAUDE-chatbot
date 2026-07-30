# Perguntas Frequentes (FAQ)

### O que aconteceu com o n8n?
Nós evoluímos a arquitetura. O n8n foi um excelente MVP (Produto Mínimo Viável) para validar os fluxos e a lógica de múltiplos agentes. No entanto, para escalar com mais controle de estado, latência reduzida e tratamento rigoroso de JSON, migramos todo o fluxo para um backend Node.js (TypeScript) no Render. Todo o histórico do n8n foi preservado na aba [Histórico Legado](/legado-n8n/index).

### Quais modelos o OpenRouter utiliza?
Utilizamos uma cascata dos melhores modelos gratuitos (`:free`) para otimizar os custos:
- `nvidia/nemotron-3-nano-30b-a3b:free`
- `qwen/qwen3-next-80b-a3b-instruct:free`
- `meta-llama/llama-3.3-70b-instruct:free`
O sistema tenta o primeiro, e caso ocorra lentidão ou erro de API, faz fallback automático para os próximos.

### Como as chaves de API estão protegidas?
O frontend (React SPA) **nunca** possui as chaves de API. Toda requisição é enviada ao nosso webhook no backend, que possui variáveis de ambiente (`.env`) seguras no Render (`OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`).

### O RAG é lento?
Não. A busca vetorial é otimizada pela extensão `pgvector` e índice `hnsw` no PostgreSQL (Supabase), permitindo encontrar as diretrizes corretas em milissegundos antes de invocar o LLM.
