## Sobre

## Estrutura 

src/

    📂 api/

        📄 webhook.ts (Recebe o payload do React ou da Evolution API/WhatsApp)

    📂 core/

        📄 orchestrator.ts (A máquina de estado: busca a sessão no banco, decide se chama o RAG e atualiza o status)

    📂 services/

        📄 openrouter.ts (Lida com a cascata de LLMs meta-llama, qwen, etc.)

        📄 langchain.ts (Faz a busca vetorial no Supabase)

        📄 database.ts (Conexão com o PostgreSQL e inserção de telemetria)