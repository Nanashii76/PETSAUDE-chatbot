# Documentação — PETSAUDE Chatbot

## Visão geral

Este projeto provê uma interface de chat (frontend) conectada a um workflow no n8n que orquestra múltiplos agentes de IA por especialidade, com memória conversacional e consulta a documentos via RAG.

O fluxo “fonte da verdade” do n8n (export) está versionado em:

- [n8n.json](./n8n.json)

## Fluxo atual (resumo)

1. Frontend envia `POST` para o Webhook do n8n com `{ so, user, content, timestamp }`.
2. O n8n normaliza campos no node **Edit Fields**.
3. Um agente **roteador de intenções** classifica o texto em: cardiologia, dermatologia, endocrinologia ou duvidas_gerais.
4. Um **Switch** direciona para o agente especialista correspondente.
5. Um node **Code** tenta extrair/validar o JSON do agente e mapeia campos para um formato padrão.
6. O n8n responde ao frontend com `{ "output": "..." }`.

Detalhes completos em: [Fluxo no n8n](./fluxo-n8n.md).

## Como esta documentação está organizada

- Arquitetura do sistema: visão macro dos componentes e integrações
- Fluxo no n8n: passo a passo por nodes e ramificações
- RAG: como estão configuradas as bases no Supabase e como atualizar
- Execução: rodar frontend local, configurar `.env`, testar webhook
- Manutenção: checklist de mudanças seguras (prompts, credenciais, stores)
- FAQ: problemas comuns e diagnóstico

Links:

- [Arquitetura](./arquitetura.md)
- [Fluxo no n8n](./fluxo-n8n.md)
- [RAG](./rag.md)
- [Execução](./execucao.md)
- [Manutenção](./manutencao.md)
- [FAQ](./faq.md)