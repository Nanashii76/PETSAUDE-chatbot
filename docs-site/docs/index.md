---
layout: home

hero:
  name: "Regulação SUS IA"
  text: "Triagem Inteligente"
  tagline: Sistema inteligente baseado em agentes LLM e RAG para validação de encaminhamentos médicos segundo as Notas Técnicas da SES-DF.
  actions:
    - theme: brand
      text: Ver Arquitetura
      link: /arquitetura
    - theme: alt
      text: Como funciona o RAG
      link: /rag

features:
  - title: Arquitetura Moderna
    details: SPA em React conectada a uma API Node.js (TypeScript) com acesso direto a PostgreSQL (pg, sem ORM).
  - title: Múltiplos Agentes AI
    details: Agentes especializados em Cardiologia, Dermatologia e Endocrinologia, via OpenRouter com cascata de LLMs gratuitos.
  - title: RAG Integrado
    details: Recuperação vetorial (PostgreSQL + pgvector, embeddings via Gemini) das Notas Técnicas oficiais para fundamentar cada decisão.
---
