## Sobre

## Estrutura 

src/

    📂 api/

        📄 webhook.ts (Recebe o payload do React ou da Evolution API/WhatsApp)

    📂 core/

        📄 orchestrator.ts (A máquina de estado: busca a sessão no banco, chama o RAG e o LLM, e atualiza o status)

        📄 documents.ts (Texto-fonte das Notas Técnicas, usado só pelo script de ingestão do RAG)

    📂 services/

        📄 openrouter.ts (Lida com a cascata de LLMs meta-llama, qwen, etc.)

        📄 embeddings.ts (Gera embeddings via API gratuita do Gemini (text-embedding-004) — desacoplado do LLM de chat, que continua no OpenRouter)

        📄 rag.ts (Busca vetorial no Postgres/pgvector via a função match_documentos, filtrada por especialidade)

        📄 database.ts (Conexão com o PostgreSQL e inserção de telemetria)

    📂 scripts/

        📄 ingestDocumentosRag.ts (Divide as Notas Técnicas em chunks, gera os embeddings e popula a tabela documentos_rag — rodar manualmente com `npx tsx src/scripts/ingestDocumentosRag.ts` sempre que os documentos-fonte mudarem)