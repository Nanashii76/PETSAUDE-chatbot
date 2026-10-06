# Modelos de IA (Cascata de LLMs)

Toda chamada ao LLM de conversação passa por `chamarLLMComCascata`
(`backend/src/services/openrouter.ts`), que tenta uma lista de modelos gratuitos em ordem até um
responder com sucesso — resiliência a rate limit e indisponibilidade sem custo.

```ts
// Ordenados por confiabilidade+velocidade medida ao vivo — isto é uma foto de um momento, não uma
// verdade permanente. nemotron já foi o mais rápido e confiável (ver incidentes #6-#7) e numa
// re-checagem passou a devolver JSON vazio/degenerado com frequência (incidente #8); por isso foi
// rebaixado, não removido.
const FALLBACK_CASCADE = [
  'google/gemma-4-26b-a4b-it:free',          // Rápido quando disponível, mas o mais rate-limited (429)
  'apodex/apodex-1.1-mini:free',             // Novo no catálogo — rápido e confiável nos testes ao vivo
  'dots-studio/dots-3-note-preview:free',    // Provider diferente (AtlasCloud) — confiável e rápido nos testes mais recentes
  'liquid/lfm-2.5-2.6b:free',                // Provider diferente (Liquid) — confiável e rápido nos testes mais recentes
  'nvidia/nemotron-3-super-120b-a12b:free',  // Rebaixado: respondendo vazio/degenerado com frequência (incidente #8)
  'google/gemma-4-31b-it:free'               // Mesmo provedor/pool de rate limit do 1º — rede de segurança final, baixo custo de tentar
];
```

Seis modelos, não quatro: a cascata original tinha só 4 entradas e, na prática, costuma esgotar as
2-3 primeiras antes de uma dar certo numa noite ruim de rate limit — uma gama maior de opções reduz a
chance de todas falharem ao mesmo tempo. `openrouter.ts` também detecta uma resposta HTTP 200 "bem-
sucedida" mas vazia/degenerada (ex: `{"": ""}`) e trata como falha, acionando o próximo modelo — ver
[incidente #8](/incidentes#8-modelo-bem-sucedido-devolvendo-json-vazio-degenerado).

Cada chamada usa `response_format: { type: 'json_object' }` e `temperature: 0.2` para respostas
clínicas determinísticas. Isso não é cosmético — veja no
[Histórico de Incidentes](/incidentes#5-cascata-de-modelos-e-resposta-nao-json) como um modelo que
ignora esse parâmetro derrubou o parse de JSON em produção.

Também manda `reasoning: { max_tokens: 100 }` e usa `AbortController` com timeout de 30s por
tentativa. Todo modelo `:free` atual do catálogo suporta "thinking"/reasoning — sem limitar isso,
um modelo pode gastar o `max_tokens` inteiro narrando o próprio raciocínio em texto livre e nunca
chegar a emitir o JSON (`finish_reason: "length"`, parse quebra). É um teto numérico
(`max_tokens: 100`), não `enabled: false` nem `effort: 'low'`: testado ao vivo,
`liquid/lfm-2.5-2.6b:free` rejeita reasoning totalmente desligado com erro 400 ("Reasoning is
mandatory for this endpoint"), e `effort: 'low'` ainda deixava passar 1000+ tokens de raciocínio em
tarefas complexas — o teto numérico é aceito por todos os 4 modelos, mesmo que dois deles
(`dots-studio`, `liquid`) não o respeitem à risca. O timeout de 30s é rede de segurança contra
travamento, não otimização de velocidade: é maior que a faixa observada de 15-28s desses dois
modelos de propósito, para não converter uma resposta lenta-mas-correta numa falha rápida. Ver
[Histórico de Incidentes](/incidentes#6-modelo-de-raciocinio-estourando-max-tokens-antes-do-json) e
[#7](/incidentes#7-latencia-inerente-aos-modelos-gratuitos-de-raciocinio).

## Como a cascata funciona

```mermaid
flowchart TD
  A["Tenta modelo 1"] -->|"200 OK + conteúdo real"| S["Retorna resposta"]
  A -->|"erro (404/429/timeout) ou JSON vazio/degenerado"| B["Tenta modelo 2"]
  B -->|"sucesso"| S
  B -->|"falha"| C["Tenta modelo 3"]
  C -->|"sucesso"| S
  C -->|"falha"| D["... até o modelo 6"]
  D -->|"sucesso"| S
  D -->|"falha"| E["Lança erro:<br/>'Todos os modelos da cascata falharam'"]
```

Se qualquer modelo responder com sucesso, a cascata para ali — os modelos seguintes nunca são
chamados. Isso é coberto por testes automatizados em
[`services/openrouter.test.ts`](https://github.com/Nanashii76/PETSAUDE-chatbot/blob/feat-testing-rag/backend/src/tests/services/openrouter.test.ts).

::: warning O catálogo de modelos gratuitos muda com frequência
O catálogo de modelos `:free` do OpenRouter muda com frequência, sem aviso — modelos da cascata
original já deixaram de existir, e um modelo que funcionava bem numa sessão já passou a devolver
respostas vazias/degeneradas na seguinte, sem nenhuma mudança de código (ver
[Histórico de Incidentes](/incidentes)). Antes de trocar algum ID aqui, confira
`GET https://openrouter.ai/api/v1/models` e filtre por `supported_parameters` contendo
`response_format` — nem todo modelo gratuito respeita esse contrato. E não confie só no status HTTP:
teste com um prompt clínico real e confira se o conteúdo retornado faz sentido, não só se veio 200.
:::

## Embeddings

O modelo de embeddings é uma peça separada e desacoplada desta cascata — veja
[RAG vetorial](/rag) para os detalhes de `gemini-embedding-001`.
