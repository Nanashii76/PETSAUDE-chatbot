# Plano de testes manuais

Este checklist cobre os fluxos que dependem do LLM/RAG reais (não dá pra mockar
com confiança e ainda garantir que o comportamento clínico está certo). Para
lógica pura (chunking, parsing, cascata de fallback), veja os testes automatizados
em `src/**/*.test.ts` — rode com `npm test`.

## 1. Pré-requisitos antes de testar

- [ ] Variáveis de ambiente presentes no `.env`: `DATABASE_URL`, `OPENROUTER_API_KEY`,
      `GEMINI_API_KEY`, `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`/`EVOLUTION_INSTANCE`
      (só necessárias se for testar o canal WhatsApp).
- [ ] Migration `src/database/migration_rag.sql` aplicada no Supabase.
- [ ] Ingestão rodada: `npx tsx src/scripts/ingestDocumentosRag.ts`.
- [ ] Confirmar que a base vetorial está populada:
  ```sql
  SELECT especialidade, count(*) FROM documentos_rag GROUP BY especialidade;
  ```
  Esperado: `cardiologia: 8`, `dermatologia: 10`, `endocrinologia: 11`.

## 2. Casos fim-a-fim por especialidade

Cole cada mensagem no chat do front. Depois de um caso fechar (`FINALIZADO`/`NAO_ELEGIVEL`),
a próxima mensagem já abre uma sessão nova e passa pelo roteador de novo.

Em todos os casos, confira no log do backend a linha `[RAG] Recuperados N trechos
para "<especialidade>": <títulos>` — os títulos precisam bater com o assunto da
pergunta (ex: pergunta de tireoide não pode recuperar o chunk de diabetes).

### Cardiologia

| # | Mensagem | Status esperado |
|---|----------|------------------|
| 1 | "Paciente de 62 anos, masculino, com hipertensão arterial mal controlada, em uso de losartana 100mg, anlodipino 10mg e hidroclorotiazida 25mg em doses plenas, com boa adesão confirmada. PA aferida em duas ocasiões: 168x102 e 172x105 mmHg. Sem sinais de hipertensão secundária." | `PENDENTE` (falta sinais/sintomas e exames) |
| 1b | (continuação) "O paciente relata cefaleia frequente e tontura ocasional. Exames laboratoriais recentes: potássio 4,2 mEq/L, creatinina 0,9 mg/dL, glicemia de jejum 98 mg/dL, perfil lipídico dentro da normalidade. Eletrocardiograma sem alterações, realizado há 1 mês." | `FINALIZADO` |
| 2 | "Paciente de 45 anos, feminino, com hipertensão leve, em uso de apenas losartana 50mg, ainda sem avaliação de adesão ao tratamento. PA em consultório: 148x92 mmHg." | `NAO_ELEGIVEL` |

### Dermatologia

| # | Mensagem | Status esperado |
|---|----------|------------------|
| 3 | "Paciente de 50 anos, com lesão pigmentada no dorso, assimétrica, bordas irregulares, diâmetro de 8mm, com crescimento recente há 3 meses e sangramento ao trauma leve. Sem biópsia realizada ainda." | `FINALIZADO` (suspeita de melanoma) |
| 4 | "Paciente de 19 anos com acne leve no rosto, ainda não iniciou nenhum tratamento tópico." | `NAO_ELEGIVEL` |

### Endocrinologia

| # | Mensagem | Status esperado |
|---|----------|------------------|
| 5 | "Paciente de 55 anos, feminino, com nódulo tireoidiano sólido hipoecoico de 1,2cm identificado em ultrassonografia, TSH normal. Sem sintomas compressivos." | `FINALIZADO` (indicação de PAAF) |
| 6 | "Paciente de 60 anos com diabetes tipo 2 controlado com metformina 850mg, hemoglobina glicada de 6,8%, sem complicações." | `NAO_ELEGIVEL` |

## 3. Casos de borda

- [ ] **Fora de escopo clínico**: enviar "Olá, bom dia" ou uma pergunta não-clínica →
      deve cair em `duvidas_gerais` e o log **não** deve mostrar uma linha `[RAG]`
      (a especialidade não tem base vetorial associada).
- [ ] **Resposta longa** (teste de corte original): "Pode me explicar detalhadamente
      todos os critérios de encaminhamento para cardiologia, dermatologia e
      endocrinologia que vocês avaliam, com exemplos de cada categoria de risco?" →
      no log do `[OpenRouter]`, `finish_reason` deve ser `"stop"`, nunca `"length"`.
- [ ] **Múltiplas especialidades em sequência**: depois de um caso fechar
      (`FINALIZADO`/`NAO_ELEGIVEL`), envie um caso de outra especialidade na mesma
      conversa → deve classificar corretamente a nova especialidade (sessão nova
      criada automaticamente, já que `buscarOuCriarSessao` só reaproveita sessões
      com `status = 'PENDENTE'`).
- [ ] **WhatsApp — eco do bot**: se estiver testando via Evolution API, confirme que
      uma mensagem com `fromMe: true` (o próprio bot respondendo) não gera nem log
      de `[Webhook Evolution] Mensagem recebida...` nem nova chamada ao LLM.

## 4. Checklist de "saúde de integração externa"

Rode isso periodicamente (ex: antes de cada deploy, ou se o chat começar a falhar
sem mudança de código) — duas vezes nesta mesma sessão de desenvolvimento um
provedor externo descontinuou um modelo sem aviso e quebrou o fluxo em produção.

- [ ] **Modelos do OpenRouter**: confira se os 4 IDs em `FALLBACK_CASCADE`
      ([openrouter.ts](src/services/openrouter.ts)) ainda existem e suportam
      `response_format`:
  ```bash
  node -e "
  require('dotenv').config();
  fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY } })
    .then(r => r.json())
    .then(d => console.log((d.data || []).filter(m => m.id.endsWith(':free') && (m.supported_parameters||[]).includes('response_format')).map(m => m.id)));
  "
  ```
  Confirme que os 4 IDs da cascata aparecem na lista impressa.

- [ ] **Modelo de embedding do Gemini**: confirme que `gemini-embedding-001`
      (usado em [embeddings.ts](src/services/embeddings.ts)) continua respondendo
      com 768 dimensões:
  ```bash
  node -e "
  require('dotenv').config();
  fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text: 'teste' }] }, taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 })
  }).then(r => r.json()).then(d => console.log(d.embedding ? d.embedding.values.length : d));
  "
  ```
  Esperado: `768`. Se vier um erro `404`/`NOT_FOUND`, o modelo foi descontinuado —
  rode `GET /v1beta/models` (sem o `:embedContent`) para achar o substituto atual.
