import dotenv from 'dotenv';
dotenv.config();

// A cascata de modelos gratuitos :free, ordenada por preferência
const FALLBACK_CASCADE = [
  'nvidia/nemotron-3-nano-30b-a3b:free',    // Rápido e limpo
  'qwen/qwen3-next-80b-a3b-instruct:free',  // Excelente para contexto longo
  'meta-llama/llama-3.3-70b-instruct:free', // Ótimo raciocínio lógico
  'openrouter/free'                         // Rede de segurança final
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
          response_format: { type: 'json_object' } // O SEGREDO: Força o LLM a retornar JSON válido!
        })
      });

      if (!response.ok) {
        console.warn(`[OpenRouter] Falha no modelo ${modelo} (Status: ${response.status}). Acionando fallback...`);
        continue; // Pula para a próxima iteração do 'for'
      }

      const data = await response.json();
      console.log(`[OpenRouter] Sucesso com o modelo: ${modelo}`);
      
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