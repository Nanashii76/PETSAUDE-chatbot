# Pontos de Atenção para Manutenção Futura

- **Sem autenticação nas rotas** — `/api/webhook` e `/api/webhook/evolution` não validam API key
  nem assinatura de webhook.
- **CI e testes de banco** — a implementação da migração inclui build, unitários e
  integração PostgreSQL/pgvector. Manter esse fluxo ao integrar a branch; veja [Testes](/testes).
- **Tipagem fraca em pontos centrais** — `sessao: any` em `orchestrator.ts` e `payload: any` em
  `webhook.ts`, apesar de `strict: true` no `tsconfig`.
- **Catálogo de modelos externos é instável por natureza** — rode o checklist de "saúde de
  integração externa" (veja [Testes](/testes)) periodicamente, não só quando algo já quebrou.
- **Capacidade do host** — backend e PostgreSQL competem por CPU/RAM no Compose.
  Medir memória, latência e uso de conexões antes de aumentar réplicas ou incluir inferência local.
- **Backup próprio** — monitorar falhas e idade dos dumps, manter cópia externa cifrada e ensaiar restore.
- **Evolução do schema** — adicionar migrações numeradas sem alterar arquivos já aplicados.
- **Volume** — avaliar agregação SQL do painel, retenção e paginação antes de particionar.
- **Concorrência da conversa** — sessão única não substitui fila de mensagens e idempotência de webhooks.

Veja também o [Histórico de Incidentes](/incidentes) para o contexto completo de cada um desses
pontos.
