# Infraestrutura

Toda a stack roda no tier gratuito, por decisão deliberada do projeto:

| Serviço | Papel | Limitação relevante |
|---|---|---|
| Render (free) | Hospeda o backend Express | 512MB RAM · dorme após inatividade (cold start) |
| Supabase (free) | PostgreSQL + pgvector | Suficiente para o volume atual de sessões/chunks |
| OpenRouter (`:free`) | Modelos de chat | Catálogo instável, rate limit por modelo |
| Gemini (free tier) | Embeddings | Quota diária generosa, mas é mais um provedor externo |
| Vite (build) | Frontend | — |

Não há Dockerfile nem `docker-compose` no repositório. O deploy do backend é direto via Render a
partir do branch; o frontend é buildado com Vite; a documentação (este site) é publicada via
GitHub Actions no GitHub Pages.

::: warning Modelo de embedding local foi avaliado e descartado
Um modelo de embedding local (`@xenova/transformers`, sem nenhuma API externa) foi testado nesta
branch: mediu-se **~732MB de RSS** só para carregar o modelo quantizado (~130MB em disco), acima do
limite de 512MB do Render free — antes mesmo de somar Express, o pool do Postgres e o resto do
processo Node. A biblioteca também não expõe uma API pública para limitar esse consumo de memória.
Por isso a escolha final foi usar a API gratuita do Gemini para embeddings, em vez de rodar
100% local. Veja [RAG vetorial](/rag).
:::

## Por que tudo gratuito

O projeto é um MVP de apoio à regulação clínica do SUS-DF, sem orçamento de infraestrutura. Cada
escolha de arquitetura — a cascata de LLMs, o RAG vetorial em vez de fine-tuning, os embeddings via
API em vez de local — foi feita para caber dentro de limites de tier gratuito, o que também é a
origem da maior parte dos incidentes documentados em
[Histórico de Incidentes](/incidentes): serviços gratuitos mudam de catálogo e de limites com
frequência, sem aviso.
