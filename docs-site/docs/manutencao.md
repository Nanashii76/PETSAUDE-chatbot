# Pontos de Atenção para Manutenção Futura

- **Sem autenticação nas rotas** — `/api/webhook` e `/api/webhook/evolution` não validam API key
  nem assinatura de webhook.
- **Sem CI** — os workflows do GitHub Actions só publicam documentação; nada roda
  `npm test`/`tsc` automaticamente em PR.
- **Tipagem fraca em pontos centrais** — `sessao: any` em `orchestrator.ts` e `payload: any` em
  `webhook.ts`, apesar de `strict: true` no `tsconfig`.
- **Catálogo de modelos externos é instável por natureza** — rode o checklist de "saúde de
  integração externa" (veja [Testes](/testes)) periodicamente, não só quando algo já quebrou.
- **RAM do Render free é o teto real do projeto** — qualquer nova dependência que rode inferência
  local (embeddings, re-ranking, etc.) precisa ser medida antes de ir para produção, não só
  assumida como "leve". Veja o incidente descrito em [Infraestrutura](/infraestrutura).

Veja também o [Histórico de Incidentes](/incidentes) para o contexto completo de cada um desses
pontos.
