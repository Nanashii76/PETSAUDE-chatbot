# Testes

A validação da nova infraestrutura aprovou **93 testes unitários em 11 arquivos e
8 testes de integração em PostgreSQL 16 com pgvector 0.8.2**, além do build TypeScript.
Esses números registram a validação da implementação, não uma contagem atualizada automaticamente.

## Testes unitários

Cobrem chunking, dados coletados, encaminhamentos, regulação, unidades, painel,
orquestrador, Evolution, OpenRouter, RAG e configuração/acesso ao banco. Nos testes
unitários, chamadas externas e acesso ao banco são substituídos por mocks.

```sh
cd backend
npm ci
npm run build
npm test
```

Usar Node 22.12 ou superior compatível com as dependências; Docker e CI usam Node 22.
`npm test` exclui `dist` e a pasta de integração. A suíte de banco verifica limites
do pool, rejeição de configuração inválida, checksum, rollback/liberação de conexão
e preservação de zero na contagem de tokens.

## Integração real com PostgreSQL

Na raiz do repositório da branch de implementação:

```sh
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f docker-compose.test.yml down -v
```

Este Compose usa um projeto separado, banco `petsaude_test` e armazenamento tmpfs.
Executa unitários e integração, sem chamadas ao Gemini ou OpenRouter.

| Cenário | Verificação |
|---|---|
| Bootstrap | Reexecução, migradores concorrentes e detecção de checksum alterado |
| Concorrência | 20 chamadas criam uma identidade e uma sessão, com um marcador `nova` |
| Canais | Mesmo identificador em web/WhatsApp não compartilha sessão ou perfil no painel |
| Perfil tardio | Sessão existente recebe o vínculo do perfil cadastrado posteriormente |
| Integridade | Histórico, estados, tokens negativos, FK órfã, trigger e exclusões |
| RAG | Vetor 768d, filtro, limite, similaridade e checklist |
| Privilégios | Conta da API não altera schema, documentos RAG ou ledger |
| Migração legada | Adoção explícita, rollback em duplicatas e preservação dos embeddings |

Execução contra banco externo dedicado:

```sh
cd backend
TEST_DATABASE_URL=postgres://usuario:senha@localhost:5432/petsaude_test npm run test:integration
```

::: danger Banco descartável obrigatório
A suíte recria o schema `public`. Exige nome de banco terminado em `_test`, mas o
operador ainda deve conferir a conexão e usar exclusivamente dados descartáveis.
:::

## Validação operacional

O Compose completo foi iniciado em ambiente isolado. `/health` respondeu, a conta
restrita gravou uma sessão e mensagem sintéticas, e um dump produzido por
`ops/backup.sh` foi restaurado em outro banco, confirmando a mensagem.
Isso não substitui o ensaio com uma cópia dos dados de produção, comparação de
contagens e testes de consulta descritos em [Migração e backup](/migracao-postgresql).

O workflow `backend-ci.yml` da branch de implementação executa build, unitários,
smoke HTTP e integração Docker. Publicar somente os documentos na `main` não leva
esse código junto; a integração da implementação segue revisão própria.

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
