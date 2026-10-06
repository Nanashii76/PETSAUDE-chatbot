import dotenv from 'dotenv';
dotenv.config();

// Detecta um JSON "tecnicamente válido" mas sem conteúdo útil (ex: '{"": ""}', '{}', '   '), que
// response.ok não pega porque o HTTP em si foi 200. Verificação genérica (sem conhecer o esquema
// de domínio dos prompts) — só confere se há pelo menos uma chave com valor não-vazio.
function respostaDegenerada(conteudo: string): boolean {
  if (!conteudo || conteudo.trim().length < 10) return true;
  try {
    const obj = JSON.parse(conteudo);
    if (obj && typeof obj === 'object') {
      return !Object.values(obj).some((v) => v !== null && v !== '' && v !== undefined);
    }
  } catch {
    // Não é JSON — deixa o parse de verdade no orquestrador decidir se é um erro.
  }
  return false;
}

// A cascata de modelos gratuitos :free, ordenada por preferência.
// IMPORTANTE: o catálogo de modelos gratuitos do OpenRouter muda com frequência —
// modelos são descontinuados/renomeados sem aviso. Antes de trocar algum item aqui,
// confira o catálogo atual em https://openrouter.ai/api/v1/models e filtre por
// `supported_parameters` contendo "response_format" (exigido, pois usamos JSON mode
// abaixo) — nem todo modelo ":free" suporta isso; alguns (ex: "openrouter/free",
// removido daqui por esse motivo) ignoram a instrução e retornam texto livre,
// quebrando o parse do JSON.
// Ordenados por confiabilidade+velocidade medida ao vivo com o prompt clínico real (ver Histórico
// de Incidentes #6-#8) — o catálogo de modelos gratuitos muda de comportamento com frequência,
// então "ordenados por velocidade" numa sessão pode estar errado na próxima. nemotron, que já foi o
// mais rápido e confiável, passou a devolver JSON vazio/degenerado ({"": ""}) em boa parte das
// chamadas numa re-checagem posterior — por isso foi rebaixado, não removido (ainda funciona às
// vezes e tem bom raciocínio quando funciona).
const FALLBACK_CASCADE = [
  'google/gemma-4-26b-a4b-it:free',          // Rápido quando disponível, mas historicamente o mais rate-limited (429)
  'apodex/apodex-1.1-mini:free',             // Novo no catálogo — rápido e confiável nos testes ao vivo
  'dots-studio/dots-3-note-preview:free',    // Provider diferente (AtlasCloud) — confiável e rápido nos testes mais recentes
  'liquid/lfm-2.5-2.6b:free',                // Provider diferente (Liquid) — confiável e rápido nos testes mais recentes
  'nvidia/nemotron-3-super-120b-a12b:free',  // Rebaixado: respondendo vazio/degenerado com frequência numa re-checagem
  'google/gemma-4-31b-it:free'               // Mesmo provedor de rate limit do 1º (Google) — rede de segurança final, baixo custo de tentar
];

// Rede de segurança contra travamento, não uma otimização de velocidade: medido com o prompt
// clínico real, dots-studio e liquid levam 15-28s mesmo em caminho de sucesso — um timeout mais
// curto que isso converteria uma resposta lenta (mas correta) numa falha rápida, piorando a
// experiência. 30s cobre a faixa observada e ainda limita um travamento de rede genuíno.
const TIMEOUT_POR_TENTATIVA_MS = 30_000;

export async function chamarLLMComCascata(
  systemPrompt: string,
  mensagensHistorico: { role: string; content: string }[]
) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não está configurada no .env");
  }

  // Prepara as mensagens (O contexto do agente + a conversa do usuário)
  const messages = [
    { role: 'system', content: systemPrompt },
    ...mensagensHistorico
  ];

  for (const modelo of FALLBACK_CASCADE) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_POR_TENTATIVA_MS);
    const inicio = Date.now();

    try {
      console.log(`[OpenRouter] Tentando inferência com o modelo: ${modelo}`);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/regulacao-sus', // Recomendado pelo OpenRouter
          'X-Title': 'Regulação SUS'
        },
        body: JSON.stringify({
          model: modelo,
          messages: messages,
          temperature: 0.2, // Baixa temperatura para respostas clínicas mais determinísticas
          max_tokens: 3072, // Espaço para reasoning residual (modelos que ignoram o teto abaixo) + o JSON completo
          response_format: { type: 'json_object' }, // O SEGREDO: Força o LLM a retornar JSON válido!
          // Todos os modelos ":free" atuais suportam "thinking"/reasoning, e sem limitar isso um
          // modelo pode gastar o max_tokens inteiro só "pensando" em texto livre antes do JSON e
          // nunca terminar (finish_reason: "length", parse quebra). "max_tokens: 100" em vez de
          // "enabled: false" porque pelo menos um modelo da cascata (liquid/lfm-2.5-2.6b:free)
          // retorna erro 400 se o reasoning for completamente desligado — um teto numérico pequeno
          // é aceito por todos, mesmo que nem todo modelo o respeite à risca em tarefas complexas.
          reasoning: { max_tokens: 100 }
        })
      });

      if (!response.ok) {
        console.warn(`[OpenRouter] Falha no modelo ${modelo} (Status: ${response.status}). Acionando fallback...`);
        continue; // Pula para a próxima iteração do 'for'
      }

      const data = await response.json();
      const conteudo = data.choices[0].message.content;

      // Alguns modelos, raramente, devolvem HTTP 200 com um JSON tecnicamente válido mas vazio ou
      // degenerado (ex: '{"": ""}') em vez do objeto esperado — descoberto ao vivo com
      // nvidia/nemotron-3-super-120b-a12b:free. response.ok não detecta isso: sem essa checagem, a
      // cascata para aqui e devolve lixo em vez de tentar o próximo modelo.
      if (respostaDegenerada(conteudo)) {
        console.warn(`[OpenRouter] Modelo ${modelo} devolveu uma resposta vazia/degenerada: ${conteudo}. Acionando fallback...`);
        continue;
      }

      console.log(`[OpenRouter] Sucesso com o modelo: ${modelo} (finish_reason: ${data.choices[0].finish_reason}, ${Date.now() - inicio}ms)`);

      return {
        conteudo,
        modelo_usado: modelo,
        tokens_prompt: data.usage?.prompt_tokens || 0,
        tokens_resposta: data.usage?.completion_tokens || 0
      };

    } catch (error) {
      const motivo = error instanceof Error && error.name === 'AbortError'
        ? `timeout > ${TIMEOUT_POR_TENTATIVA_MS}ms`
        : 'erro de rede';
      console.error(`[OpenRouter] Falha no modelo ${modelo} (${motivo}, ${Date.now() - inicio}ms). Acionando fallback...`);
      // Continua para o próximo modelo do array
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Se o loop terminar e todos falharem:
  throw new Error("Todos os modelos da cascata falharam. Verifique sua conexão ou a disponibilidade do OpenRouter.");
}