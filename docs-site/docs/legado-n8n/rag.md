
# RAG (Retrieval Augmented Generation)

## Visão geral

O workflow do n8n utiliza RAG para fundamentar as respostas em documentos e notas técnicas. Na prática, isso é feito com:

- Embeddings (OpenAI) para indexar e consultar textos;
- Supabase (Vector Store + função SQL) para armazenar e recuperar trechos relevantes;
- Ferramentas do LangChain no n8n (`toolVectorStore`) conectadas aos agentes.

O objetivo é que os agentes especialistas consultem a base antes de responder, reduzindo alucinação e mantendo aderência às Notas Técnicas.

## Como está configurado hoje (no workflow)

No export atual em [n8n.json](./n8n.json), existem Vector Stores e ferramentas com estas características:

### Vector Store “documents” (consulta)

- Tabela: `documents`
- Query (função): `match_documents`
- Usada por ferramentas:
	- `ferramenta_rag_geral`
	- `ferramenta_rag_geral2`
	- `ferramenta_rag_geral3`

### Vector Store “notes_endocri” (consulta)

- Tabela: `notes_endocri`
- Query (função): `match_notes_endocri`
- Usada pela ferramenta: `ferramenta_rag_geral4`

### Vector Store “notes_cardi” (inserção / treino)

Existe um fluxo de treino que **insere** chunks na tabela `notes_cardi` usando a query `match_notes_cardi`.

Observação importante: no export atual, o agente de Cardiologia consulta a ferramenta `ferramenta_rag_geral2`, que está ligada à tabela `documents` (não `notes_cardi`). Se a intenção é que Cardiologia use `notes_cardi`, é necessário ajustar o node de ferramenta/Vector Store no n8n.

## Fluxo de “treinamento” (ingestão)

No export atual, há um fluxo com:

- **Manual Trigger** → **Google Drive (Download file)** → **Text Splitter** → **Data Loader** → **Supabase Vector Store (insert)**

Isso serve para:

- baixar um arquivo (ex.: PDF/texto do Drive);
- converter em documentos;
- dividir em chunks;
- gerar embeddings;
- inserir no Supabase.

## Boas práticas para prompts + RAG

Para que o RAG funcione bem no n8n:

- no prompt do agente, exigir explicitamente o uso da ferramenta (já está configurado nos agentes especialistas);
- manter o output do agente em JSON estrito, para passar pelo node de normalização sem perdas;
- manter documentos curtos e bem segmentados (chunking consistente).

## Diagnóstico rápido

Se o agente “não consulta o RAG” na prática:

- verifique se o agente realmente tem a ferramenta conectada no canvas;
- verifique se o modelo e o node de ferramenta estão ligados ao agente correto;
- confirme se a tabela/`queryName` do Supabase está correta;
- teste a função `match_*` diretamente no Supabase (retorno, filtros, e similaridade).

