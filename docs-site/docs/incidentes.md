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

## 6. Modelo de raciocínio estourando max_tokens antes do JSON {#6-modelo-de-raciocinio-estourando-max-tokens-antes-do-json}

```
[OpenRouter] Falha no modelo google/gemma-4-26b-a4b-it:free (Status: 429)
[OpenRouter] Falha no modelo nex-agi/nex-n2.5-mini:free (Status: 404)
[OpenRouter] Sucesso com o modelo: nvidia/nemotron-3-super-120b-a12b:free (finish_reason: length)
[Orquestrador][DEBUG] JSON bruto do especialista: We need to follow the flow. The user gave a
description. We need to extract data and compare with required fields. [...]
[Orquestrador] Falha no JSON final do agente especialista: We need to follow...
```

Recorrência do incidente #5: `nex-agi/nex-n2.5-mini:free` saiu do catálogo (404), e a cascata caiu
no `nvidia/nemotron-3-super-120b-a12b:free`. Esse modelo é um modelo de raciocínio — ele suporta
(e, por padrão, usa) o parâmetro `reasoning`/`include_reasoning` do OpenRouter, narrando seu
raciocínio em texto livre antes de emitir a resposta final. Com `max_tokens: 2048`, o raciocínio
sozinho consumiu o orçamento inteiro e o modelo nunca chegou a emitir o JSON
(`finish_reason: "length"`). O parse falhou e o usuário viu "Houve uma falha na estruturação
clínica" no front — de forma intermitente, já que uma nova tentativa podia ter sorte e terminar de
"pensar" a tempo.

Efeito colateral: como o parse falhava antes de `[Orquestrador]` conseguir ler os campos do JSON,
o código zerava `tokens_prompt`/`tokens_resposta` na telemetria — escondendo do banco o consumo
real de uma chamada que já tinha sido paga ao provedor.

**Correção:**
- `nex-agi/nex-n2.5-mini:free` substituído por `dots-studio/dots-3-note-preview:free` (confirmado
  via `GET /api/v1/models` com suporte a `response_format`). Escolhido em vez de outro modelo
  `google/*` de propósito: testando ao vivo, `google/gemma-4-26b-a4b-it:free` (1º da cascata) estava
  rate-limited (429) no mesmo instante — dois modelos do mesmo provedor seguidos na cascata
  compartilham o mesmo pool e falham juntos.
- Toda chamada agora manda `reasoning: { max_tokens: 100 }`, reduzindo o raciocínio narrado. Não é
  `enabled: false`: testado ao vivo, `liquid/lfm-2.5-2.6b:free` (a rede de segurança final da
  cascata) responde erro 400 ("Reasoning is mandatory for this endpoint") se o reasoning for
  completamente desligado — um teto numérico é aceito por todos os 4 modelos da cascata (ver também
  incidente #7, sobre os limites desse teto em modelos que não o respeitam à risca).
- `orchestrator.ts` passou a preservar os tokens reais retornados pelo OpenRouter mesmo quando o
  JSON final falha, em vez de zerá-los.

Coberto por testes de regressão em `openrouter.test.ts` (reasoning limitado) e
`orchestrator.test.ts` (telemetria preservada no fallback de erro).

## 7. Latência inerente aos modelos gratuitos de raciocínio {#7-latencia-inerente-aos-modelos-gratuitos-de-raciocinio}

Mesmo depois da correção do incidente #6, o tempo de resposta continuava alto (10-25s). Investigando
com o prompt clínico real (nota técnica via RAG + estado da coleta, ~2000 tokens de prompt) contra
os 4 modelos da cascata:

| Modelo | Tempo observado | `reasoning_tokens` com teto de 100 |
|---|---|---|
| `google/gemma-4-26b-a4b-it:free` | — | rate-limited (429) na maioria das tentativas |
| `nvidia/nemotron-3-super-120b-a12b:free` | ~4-15s | 90-105 (respeita o teto) |
| `dots-studio/dots-3-note-preview:free` | 15-28s | 800-1400 (ignora o teto em tarefas complexas) |
| `liquid/lfm-2.5-2.6b:free` | 17-18s | 1300+ (ignora o teto em tarefas complexas) |

Conclusão: a lentidão não é um parâmetro mal configurado — é uma característica real do catálogo
`:free` atual. `dots-studio` e `liquid` narram um bloco longo de raciocínio (visível no campo
`message.reasoning` da resposta) independente do `reasoning.max_tokens` pedido, e o único modelo
rápido e obediente (`nemotron`) tem um provedor upstream (Nvidia) com erros 503
("Service temporarily overloaded") intermitentes.

**Mitigação** (não elimina a lentidão de fundo, mas reduz a chance de cair nela):
- Cascata reordenada por velocidade medida, não só por confiabilidade: `nemotron` (rápido quando
  disponível) passou para 2º lugar, antes de `dots-studio` e `liquid` (estruturalmente lentos).
- `max_tokens` da requisição subiu de 2048 para 3072 — dá margem para o reasoning residual dos
  modelos que ignoram o teto pequeno, sem truncar o JSON no meio (recorrência do incidente #6 seria
  possível de novo sem essa margem).
- Timeout de 30s por tentativa via `AbortController`, para não travar indefinidamente num modelo
  específico — ver [Modelos de IA](/modelos-ia) para o porquê de 30s (maior que a faixa observada de
  15-28s, de propósito: um timeout mais curto trocaria uma resposta lenta-mas-correta por uma falha
  rápida).

Eliminar a lentidão de fato exigiria uma chave paga/BYOK do OpenRouter (foge do pool compartilhado
gratuito) — decisão de custo fora do escopo desta correção.
