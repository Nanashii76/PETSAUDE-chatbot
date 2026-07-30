# Recuperação de Conhecimento (RAG)

O **RAG** (Retrieval-Augmented Generation) é o coração da validação clínica do nosso sistema. Em vez de depender apenas do conhecimento "solto" do modelo de linguagem (LLM), nós ativamente recuperamos a **Nota Técnica** correta da SES-DF e forçamos o LLM a basear sua decisão nela.

## Como funciona?

1. **Ingestão:** As Notas Técnicas da SES-DF são divididas em pequenos blocos (chunks). Cada bloco passa por um modelo de inteligência artificial (ex: OpenAI `text-embedding-3-small`) para ser transformado em um vetor matemático de 1536 dimensões.
2. **Armazenamento:** Esses vetores são gravados na tabela `documentos_rag` do **Supabase**. Utilizamos a extensão `pgvector` com um índice `hnsw` para garantir buscas ultrarrápidas, mesmo com milhares de documentos.
3. **Busca:** Quando o médico envia os dados do paciente, convertemos o texto em vetor e buscamos no banco os blocos de texto matematicamente mais próximos (distância de cosseno).
4. **Geração:** O texto recuperado é injetado dinamicamente na prompt do agente de IA (via Langchain), forçando a validação estrita dos critérios de encaminhamento para o SISREG.

## Configuração do Langchain

Utilizamos os pacotes oficiais para integração nativa:

```typescript
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OpenAIEmbeddings } from '@langchain/openai';

const vectorStore = new SupabaseVectorStore(
  new OpenAIEmbeddings(),
  {
    client: supabase,
    tableName: "documentos_rag",
    queryName: "match_documentos"
  }
);
```

Dessa forma, abandonamos a dependência de fluxos externos no n8n e garantimos **latência mínima**, já que tudo roda diretamente no orquestrador Node.js no Render.
