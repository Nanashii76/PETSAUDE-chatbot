import dotenv from 'dotenv';
dotenv.config();

// A cascata de modelos gratuitos :free, ordenada por preferência.
// IMPORTANTE: o catálogo de modelos gratuitos do OpenRouter muda com frequência —
// modelos são descontinuados/renomeados sem aviso. Antes de trocar algum item aqui,
// confira o catálogo atual em https://openrouter.ai/api/v1/models e filtre por
// `supported_parameters` contendo "response_format" (exigido, pois usamos JSON mode
// abaixo) — nem todo modelo ":free" suporta isso; alguns (ex: "openrouter/free",
// removido daqui por esse motivo) ignoram a instrução e retornam texto livre,
// quebrando o parse do JSON.
const FALLBACK_CASCADE = [
  'google/gemma-4-26b-a4b-it:free',          // Rápido e limpo
  'dots-studio/dots-3-note-preview:free',    // Provider diferente (AtlasCloud) — substitui nex-agi (404, saiu do catálogo).
                                              // Propositalmente não é outro modelo "google/*": os dois primeiros
                                              // seguidos do mesmo provedor ficam vulneráveis ao mesmo rate limit.
  'nvidia/nemotron-3-super-120b-a12b:free',  // Ótimo raciocínio lógico
  'liquid/lfm-2.5-2.6b:free'                 // Rede de segurança final
];

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
    try {
      console.log(`[OpenRouter] Tentando inferência com o modelo: ${modelo}`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
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
          max_tokens: 2048, // Garante espaço suficiente para o JSON completo (nota técnica + histórico deixam o prompt longo)
          response_format: { type: 'json_object' }, // O SEGREDO: Força o LLM a retornar JSON válido!
          // Todos os modelos ":free" atuais suportam "thinking"/reasoning, e sem isso um modelo de
          // raciocínio pode gastar o max_tokens inteiro só "pensando" em texto livre antes do JSON
          // e nunca terminar (finish_reason: "length", parse quebra). "effort: low" em vez de
          // "enabled: false" porque pelo menos um modelo da cascata (liquid/lfm-2.5-2.6b:free)
          // retorna erro 400 se o reasoning for completamente desligado — "low" é aceito por todos.
          reasoning: { effort: 'low' }
        })
      });

      if (!response.ok) {
        console.warn(`[OpenRouter] Falha no modelo ${modelo} (Status: ${response.status}). Acionando fallback...`);
        continue; // Pula para a próxima iteração do 'for'
      }

      const data = await response.json();
      console.log(`[OpenRouter] Sucesso com o modelo: ${modelo} (finish_reason: ${data.choices[0].finish_reason})`);
      
      return {
        conteudo: data.choices[0].message.content,
        modelo_usado: modelo,
        tokens_prompt: data.usage?.prompt_tokens || 0,
        tokens_resposta: data.usage?.completion_tokens || 0
      };

    } catch (error) {
      console.error(`[OpenRouter] Erro de rede/Timeout com ${modelo}. Acionando fallback...`);
      // Continua para o próximo modelo do array
    }
  }

  // Se o loop terminar e todos falharem:
  throw new Error("Todos os modelos da cascata falharam. Verifique sua conexão ou a disponibilidade do OpenRouter.");
}