# Testes

Duas camadas, com propósitos diferentes: testes automatizados para lógica pura, e um checklist
manual para os fluxos que dependem do LLM/RAG de verdade.

## Automatizados — Vitest

27 testes em 5 suítes, em `backend/src/tests/`:

| Suíte | Cobre |
|---|---|
| `tests/core/chunking.test.ts` | Divisão em chunks — inclui regressão do bug de cabeçalhos "soltos" (Micoses/Prurido) |
| `tests/core/orchestrator.test.ts` | Máquina de estados — inclui regressão do especialista devolvendo texto não-JSON |
| `tests/services/evolution.test.ts` | Parsing do webhook do WhatsApp (eco, mídia, payload malformado) |
| `tests/services/openrouter.test.ts` | Cascata de fallback — inclui regressão de "todos os modelos falham" |
| `tests/services/rag.test.ts` | Busca vetorial com embeddings e Postgres mockados |

Nenhum teste automatizado bate em API real (Gemini/OpenRouter/Postgres) — toda fronteira de rede é
mockada com `vi.mock`. Rodar com:

```bash
cd backend
npm test
```

## Manual — `backend/TESTING.md`

Checklist para os fluxos que dependem do LLM/RAG de verdade:

- **Pré-requisitos** — variáveis de ambiente, migration aplicada, ingestão rodada.
- **Casos fim-a-fim por especialidade** — mensagem exata para colar no chat e status esperado
  (`FINALIZADO`/`NAO_ELEGIVEL`), para cada uma das 3 especialidades.
- **Casos de borda** — pergunta fora de escopo clínico, resposta longa (teste de corte), múltiplas
  especialidades em sequência na mesma conversa, eco de mensagem no WhatsApp.
- **Saúde de integração externa** — um checklist para rodar periodicamente, com o comando exato
  para checar se os modelos do OpenRouter ou o modelo de embedding do Gemini ainda existem — os
  dois já quebraram o sistema uma vez (veja [Histórico de Incidentes](/incidentes)).
