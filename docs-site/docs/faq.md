# Perguntas Frequentes (FAQ)

### O que aconteceu com o n8n?
Nós evoluímos a arquitetura. O n8n foi um excelente MVP (Produto Mínimo Viável) para validar os
fluxos e a lógica de múltiplos agentes. No entanto, para escalar com mais controle de estado,
latência reduzida e tratamento rigoroso de JSON, migramos todo o fluxo para um backend Node.js
(TypeScript), com infraestrutura Docker implementada para a migração. Todo o histórico do n8n foi preservado na aba
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
backend, que lê as chaves de variáveis de ambiente: conexão PostgreSQL (`DATABASE_URL` ou `PG*`),
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, e as credenciais da Evolution API para o canal WhatsApp.

### O RAG é lento?
A busca usa pgvector e HNSW com filtro por especialidade. A latência depende do corpus,
do host e da chamada ao Gemini; deve ser medida no ambiente de destino.

### O sistema tem testes automatizados?
Sim. A migração foi validada com 93 testes unitários e 8 testes de integração em banco
real. Os fluxos com LLM também têm checklist manual. Veja [Testes](/testes).


### O Supabase já foi desligado?
A documentação descreve a implementação PostgreSQL em Docker; não confirma um corte
operacional. Preservar os dados e validar o destino antes de trocar o tráfego.
Veja [Migração e backup](/migracao-postgresql).

### Preciso gerar todos os embeddings novamente?
Não, se `documentos_rag` for incluída no dump/restore e o modelo de embeddings for
mantido. A reingestão é manual, apaga a base atual e consome a API do Gemini.

### Onde estão as tabelas e seus relacionamentos?
No [dicionário de dados](/banco-de-dados), com as seis tabelas da aplicação,
`schema_migrations`, tipos, nulabilidade, chaves e índices.
