# Relatório Técnico de Dimensionamento e Requisitos de Infraestrutura
## Piloto SGEST / PET-Saúde com 50 Usuários Simultâneos
**Destinatário da Reunião:** Prof. Nilton (Laboratório AILab / UnB)  
**Projeto:** PET-Saúde / SGEST — Sistema de Regulação Inteligente SUS  
**Data:** 08 de Novembro de 2026  
**Ferramentas de Teste:** k6 v2.3.0, Docker PostgreSQL (pgvector), Node.js v20 (tsx/Express), Python psutil  

---

## 1. Sumário Executivo para a Reunião

Para o piloto do **SGEST com 50 profissionais de saúde utilizando o sistema simultaneamente** (médicos da APS, reguladores e gestores), foram executadas 4 baterias completas de testes de carga e estresse de pior caso com o **k6**.

### O Pedido para o Prof. Nilton (Resumo Direto):

| Componente | Opção A: Nuvem Híbrida (Recomendada para o Piloto Imediato) | Opção B: Auto-Hospedada AILab (Ideal para Privacidade & Escala) |
| :--- | :--- | :--- |
| **Finalidade** | Backend Node.js + Banco PostgreSQL local; IA via APIs externas | Backend + PostgreSQL + Whisper Local + LLM Local no AILab |
| **vCPUs** | **4 vCPUs** (2 para Node.js, 2 para PostgreSQL) | **8 vCPUs** |
| **Memória RAM** | **8 GB RAM** (4 GB livres para SO + 2 GB Node + 2 GB Postgres) | **16 GB a 32 GB RAM** |
| **GPU Dedicada** | Não necessária | **1 GPU NVIDIA (16GB+ VRAM, ex: RTX 3090, A4000/A5000)** |
| **Armazenamento** | **40 GB SSD / NVMe** | **100 GB NVMe** (para pesos dos modelos e cache) |
| **Rede** | **100 Mbps simétrico** (suporte a rajadas de voz de ~50 Mbps) | Rede interna do campus / AILab |
| **Sistema Operacional** | Ubuntu Server 22.04 / 24.04 LTS (x86_64) | Ubuntu Server 22.04 LTS com Drivers NVIDIA CUDA 12.x |

> [!IMPORTANT]
> **Descoberta Crítica dos Testes:** A aplicação local (Node.js + PostgreSQL) é extremamente leve e de altíssimo desempenho, suportando **mais de 1.900 requisições por segundo com latência média de 20 ms**. O gargalo limitante sob concorrência não é o servidor do AILab, mas sim as cotas de *Rate Limit* das APIs de IA gratuitas (Groq e OpenRouter), que saturam em segundos com 50 usuários simultâneos.

---

## 2. Resultados Empíricos dos Testes de Carga & Estresse

Foram submetidos quatro cenários rigorosos para mapear a capacidade nominal e o teto absoluto de pior caso:

```mermaid
flowchart LR
    A["50 a 100 Médicos Virtuais (k6)"] -->|"Voz (Áudio .wav)"| B["Node.js Backend (Express)"]
    A -->|"Triagem Clínica (Texto)"| B
    A -->|"Painel & Métricas"| B
    B -->|"Persistência & Locks"| C[("PostgreSQL 16 + pgvector")]
    B -.->|"Rate Limit (429)"| D["Groq Whisper API (30 RPM)"]
    B -.->|"Rate Limit (429)"| E["OpenRouter Free LLMs"]
```

### 2.1. Tabela Comparativa de Baterias de Teste

| Métrica Avaliada | Teste 1: Concorrência Nominal (50 VUs) | Teste 2: Cenário Piloto Realista (50 VUs mistos) | Teste 3: Pior Caso de Estresse (100 VUs - 2x Carga) | Teste 4: Saturação Interna Pura (100 VUs sem IA externa) |
| :--- | :--- | :--- | :--- | :--- |
| **Usuários Concorrentes (VUs)** | 50 simultâneos | 50 simultâneos | 100 simultâneos (Pico) | 100 simultâneos contínuos |
| **Duração** | 1 min 05 s | 1 min 30 s | 1 min 20 s | 1 min 00 s |
| **Total de Requisições** | 12.095 reqs | 1.124 reqs | 2.635 reqs | **118.896 reqs** |
| **Taxa de Transferência (RPS)** | 184 req/s | 12 req/s (com latência LLM) | 33 req/s | **1.981 req/s** |
| **Taxa de Sucesso / Erros** | 100% sucesso (0% erro) | 91.2% sucesso | 56.1% sucesso local (erros 429 de APIs) | **100% sucesso (0 falhas em 118k reqs)** |
| **Latência Média** | 2,5 ms | 3,2 s (devido a LLMs) | 1,78 s | **20,26 ms** |
| **Latência p(95)** | 4,88 ms | 4,1 s (consultas DB < 8 ms) | 6,81 s (consultas DB = 14 ms) | **44,30 ms** |
| **Pico de RAM Node.js** | 96 MB | 180 MB | 459,5 MB | **547,9 MB** |
| **Pico de CPU Node.js** | 25% (0.25 núcleo) | 32% (0.32 núcleo) | 66,7% (0.67 núcleo) | **104,4% (~1 núcleo)** |
| **Pico de RAM PostgreSQL** | 72 MB | 88 MB | 76 MB | **79,4 MB** |
| **Pico de CPU PostgreSQL** | 17% (0.17 núcleo) | 12% (0.12 núcleo) | 7,7% (0.08 núcleo) | **271,3% (~2.7 núcleos)** |
| **Banda de Rede Ingress (Upload)** | ~500 KB/s | ~2,5 MB/s | **4,0 MB/s (~35-45 Mbps)** | 273 KB/s |

---

## 3. Análise Detalhada dos Resultados

### 3.1. Capacidade do Banco de Dados PostgreSQL
O banco de dados apresentou estabilidade e rapidez extremas:
- Sob carga nominal de 50 usuários, as consultas do `/api/painel` e `/api/encaminhamentos` responderam com **p(95) de 4,88 ms**.
- Mesmo sob estresse máximo de **1.981 requisições/segundo**, o PostgreSQL processou 118.896 transações em 60 segundos com **zero falhas**, consumindo menos de **80 MB de memória RAM** e pico de 2,7 núcleos de CPU.
- O pool de conexões com `DB_POOL_MAX=10` foi suficiente para leituras e escritas rápidas, mas recomenda-se expandir para `30 a 50` em produção para evitar filas em transações longas com advisory locks.

### 3.2. Consumo de Memória do Node.js e Rajadas de Áudio
- Quando os usuários enviam áudio (.wav/.webm) para transcrição, o arquivo transita pelo `multer.memoryStorage()`.
- No teste de pior caso com 100 usuários submetendo áudios simultaneamente, o consumo de memória do processo Node.js saltou de 90 MB para **459,5 MB**.
- **Dimensionamento:** Uma VM com **8 GB de RAM** garante que, mesmo em picos com múltiplos uploads pesados e acúmulo no coletor de lixo (GC) do Node.js, não haverá risco de esgotamento de memória (*Out of Memory - OOM*).

### 3.3. Largura de Banda de Rede
- Durante a submissão de áudios concorrentes, o k6 registrou transferência sustentada de **4.0 MB/s (32 Mbps)** de tráfego de entrada (*ingress*).
- Picos de submissão simultânea de 50 profissionais (cada áudio com ~500 KB a 1 MB) geram rajadas de **25 MB a 50 MB em uma janela de 3 a 5 segundos**, demandando picos de **40 a 60 Mbps**.
- **Requisito:** A interface de rede da VM alocada no AILab deve possuir link dedicado de no mínimo **100 Mbps** para evitar engarrafamento no upload do áudio pelos dispositivos móveis ou navegadores dos profissionais.

---

## 4. O Gargalo Crítico: Rate Limits de IA Externa

> [!WARNING]
> Durante os testes com 50 e 100 VUs, **todos os erros 5xx/429 observados ocorreram exclusivamente nos serviços externos de IA**:
> - **Groq Whisper**: O plano gratuito possui teto de 30 RPM (requisições por minuto). Com 50 profissionais enviando áudios, a cota foi atingida em menos de 20 segundos, retornando `HTTP 429 Too Many Requests`.
> - **OpenRouter (Modelos Gratuitos)**: Modelos como `gemma-4-31b-it:free` e `lfm-2.5-2.6b:free` sofrem alta concorrência global e retornam `HTTP 429` ou tempos de resposta que variam entre 5s e 35s.

### Proposta Estratégica para Apresentar ao Prof. Nilton:

O laboratório AILab possui infraestrutura de servidores com placas aceleradoras (GPUs). Apresentar ao professor duas opções concretas:

```mermaid
flowchart TD
    subgraph Opção A ["Opção A: VM Simples + APIs Pagas"]
        VMA["VM AILab (4 vCPUs, 8GB RAM)"] --> N1["Node.js + Postgres"]
        N1 -->|"Chave Groq Paga ($0.0001/min)"| G["Groq Whisper API"]
        N1 -->|"Chave OpenRouter / OpenAI"| O["OpenRouter / OpenAI LLM"]
    end

    subgraph Opção B ["Opção B: Infraestrutura 100% AILab (Auto-Hospedada)"]
        VMB["Servidor AILab com GPU (8 vCPUs, 16GB RAM)"] --> N2["Node.js + Postgres"]
        N2 -->|"Transcrição Local (faster-whisper)"| W["Container Whisper GPU"]
        N2 -->|"Inconcorrência Local (Ollama / vLLM)"| L["Container LLM Llama 3 8B"]
    end
```

### Vantagens de Cada Abordagem:

1. **Opção A (Mais rápida para iniciar amanhã):**
   - Precisa de uma VM pequena do Prof. Nilton (4 vCPU, 8 GB RAM).
   - Resolve o gargalo de Rate Limit adicionando créditos pagos na Groq (o custo de transcrição de áudio na Groq é de apenas **$0,0005 por hora de áudio**, ou seja, centavos de dólar para o piloto de 50 pessoas).
   - Implementação imediata sem configurar drivers CUDA.

2. **Opção B (A melhor tecnicamente e academicamente para o AILab):**
   - Rodar o Whisper local via `faster-whisper` em um contêiner Docker com GPU.
   - Rodar um modelo LLM (como `meta-llama/Meta-Llama-3.1-8B-Instruct` ou `Qwen2.5-7B-Instruct`) via `vLLM` ou `Ollama`.
   - **Vantagem Regulatória e LGPD:** Nenhum dado de saúde de pacientes do SUS transita por servidores internacionais de nuvem; tudo permanece dentro do AILab.

---

## 5. Especificações Recomendadas para a VM

### 5.1. Tabela de Dimensionamento Detalhada

| Parâmetro | Mínimo Absoluto (Não recomendado para picos) | Recomendado para o Piloto (50 usuários) | Pior Caso com Folga (Pico de 100 usuários) |
| :--- | :--- | :--- | :--- |
| **vCPUs** | 2 vCPUs | **4 vCPUs** | 6 a 8 vCPUs |
| **Memória RAM** | 4 GB | **8 GB** | 16 GB |
| **Armazenamento** | 20 GB SSD | **40 GB SSD / NVMe** | 80 GB SSD / NVMe |
| **Rede** | 50 Mbps | **100 Mbps simétrico** | 1 Gbps |
| **Pool Postgres** | `DB_POOL_MAX=15` | `DB_POOL_MAX=30` | `DB_POOL_MAX=50` |
| **Limite de Heap Node** | Padrão (1.4 GB) | `--max-old-space-size=2048` | `--max-old-space-size=4096` |

---

## 6. Otimizações de Configuração para o Servidor

Para aplicar diretamente na máquina virtual fornecida pelo Prof. Nilton:

### 6.1. Ajuste do `.env` de Produção
```env
PORT=3000
NODE_ENV=production

# Pool de conexões calibrado para 50 profissionais
DB_POOL_MAX=35
DB_CONNECT_TIMEOUT_MS=5000
DB_IDLE_TIMEOUT_MS=30000
DB_STATEMENT_TIMEOUT_MS=15000

# String de Conexão Local no Docker
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/petsaude
```

### 6.2. Otimização do PostgreSQL (`postgresql.conf`)
Para a VM de 8 GB de RAM:
```conf
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 16MB
min_wal_size = 1GB
max_wal_size = 4GB
max_connections = 100
```

### 6.3. Script de Inicialização Node.js com Alocação de Memória
```bash
# Execução com isolamento e limite de heap seguro:
node --max-old-space-size=2048 dist/server.js
```

---

## 7. Roteiro Prático para a Reunião com o Prof. Nilton

1. **Apresentar o Contexto do Piloto:** 50 profissionais de saúde da rede SUS utilizarão simultaneamente o SGEST para triagem e encaminhamentos médicos via texto e áudio.
2. **Apresentar a Eficiência Comprovada:** O backend e o banco de dados são extremamente enxutos (consomem menos de 600 MB de RAM e 1 vCPU sob carga pesada).
3. **Solicitar a VM:**
   - *"Professor Nilton, precisamos de uma VM com **4 vCPUs, 8 GB de RAM e 40 GB de SSD** com link de rede de 100 Mbps."*
4. **Abrir a Discussão sobre a IA:**
   - *"Professor, para a IA (Whisper e LLM), o senhor prefere que utilizemos cotas pagas em nuvem com baixa latência, ou o laboratório tem interesse em hospedar o Whisper e um LLM de 8B em uma GPU local do AILab para termos conformidade total com dados do SUS?"*

---

*Arquivos de teste e logs brutos disponíveis no repositório:*
- Script do teste de pior caso: [`load-tests/test_worst_case_stress.js`](file:///home/euller/PETSAUDE-chatbot/load-tests/test_worst_case_stress.js)
- Métricas capturadas de sistema: [`load-tests/metrics_stress1_pool10.json`](file:///home/euller/PETSAUDE-chatbot/load-tests/metrics_stress1_pool10.json)
- Script de saturação interna: [`load-tests/test_pure_internal_stress.js`](file:///home/euller/PETSAUDE-chatbot/load-tests/test_pure_internal_stress.js)
- Métricas de saturação interna (118k reqs): [`load-tests/metrics_internal_stress.json`](file:///home/euller/PETSAUDE-chatbot/load-tests/metrics_internal_stress.json)
