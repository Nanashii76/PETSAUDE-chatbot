# Histórico de Incidentes Reais

Esta arquitetura foi moldada por bugs reais encontrados testando o sistema manualmente, não por
design antecipado. Vale documentar porque todos são recorrentes por natureza — dependências
externas gratuitas mudam de catálogo sem aviso.

## 1. RAG por injeção direta não escalava

O prompt injetava a Nota Técnica inteira em todo turno. Com `max_tokens: 2048` e
`response_format: json_object`, respostas longas eram cortadas no meio do JSON, quebrando o parse.

**Correção:** RAG vetorial recuperando só 4 trechos por turno — veja [RAG vetorial](/rag).

## 2. Migration do schema não aplicada

```
Failed to run sql query: ERROR:  42703: column "especialidade" does not exist
```

A tabela `documentos_rag` ainda estava no schema antigo. O RAG retornava vazio, em silêncio — sem
esse log específico do SQL Editor do Supabase, o sintoma parecia apenas "o RAG não busca nada".

**Correção:** aplicar `migration_rag.sql`, que unifica o schema antigo (3 tabelas por
especialidade + 3 funções RPC) numa única tabela `documentos_rag` + `match_documentos`.

## 3. Modelo de embedding descontinuado

```
[Ingestão] Falha: Error: [Embeddings] Falha na API do Gemini (404):
"models/text-embedding-004 is not found for API version v1beta,
or is not supported for embedContent."
```

O Google descontinuou `text-embedding-004`.

**Correção:** substituído por `gemini-embedding-001` com `outputDimensionality: 768` (truncamento
MRL, compatível com o schema existente sem precisar remigrar).

## 4. Chunking perdendo seções sem prefixo

O regex original de divisão em chunks exigia o texto literal "Consulta em Dermatologia -" no
cabeçalho. Duas seções do documento-fonte ("6. Micoses", "9. Prurido") não seguiam essa convenção e
ficaram silenciosamente fundidas nos chunks vizinhos (Eczemas, Alopecia) — sem erro, sem log,
apenas menos precisão na recuperação.

**Correção:** regex que aceita qualquer cabeçalho numerado de nível 1, normalizando o título quando
o prefixo "Consulta em..." não está presente. Coberto por teste de regressão em
`chunking.test.ts`.

## 5. Cascata de modelos e resposta não-JSON {#cascata-de-modelos-e-resposta-nao-json}

```
[OpenRouter] Falha no modelo nvidia/nemotron-3-nano-30b-a3b:free (Status: 404)
[OpenRouter] Falha no modelo qwen/qwen3-next-80b-a3b-instruct:free (Status: 404)
[OpenRouter] Falha no modelo meta-llama/llama-3.3-70b-instruct:free (Status: 404)
[OpenRouter] Sucesso com o modelo: openrouter/free (finish_reason: stop)
[Orquestrador] Falha no JSON final do agente especialista: Prezado(a) profissional de saúde,
```

3 dos 4 modelos da cascata original não existiam mais no catálogo do OpenRouter. Tudo caía no
último (`openrouter/free`, um roteador automático), que **ignorava**
`response_format: json_object` e devolvia markdown solto — quebrando o parse e mostrando "Houve uma
falha na estruturação clínica" no front, de forma intermitente.

**Correção:** cascata trocada por 4 modelos atuais, confirmados via `GET /api/v1/models` a
suportarem `response_format` (veja [Modelos de IA](/modelos-ia)). Coberto por testes de regressão
em `openrouter.test.ts` e `orchestrator.test.ts`.

```
[OpenRouter] Falha no modelo google/gemma-4-26b-a4b-it:free (Status: 429)
[OpenRouter] Sucesso com o modelo: nex-agi/nex-n2.5-mini:free (finish_reason: stop)
```

*(log real depois da correção — o primeiro modelo bateu em rate limit, e a cascata corretamente
seguiu para o próximo)*
