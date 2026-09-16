import { buscarHistoricoSessao, atualizarSessao } from '../services/database.js';
import { chamarLLMComCascata } from '../services/openrouter.js';
import { buscarContexto } from '../services/rag.js';
import {
  PROMPT_ROTEADOR,
  PROMPT_CARDIOLOGIA,
  PROMPT_DERMATOLOGIA,
  PROMPT_ENDOCRINOLOGIA,
  PROMPT_GERAL
} from './prompts.js';

export async function processarMensagemLLM(sessao: any, mensagemUsuario: string) {
  // 1. Definição Dinâmica de Agentes (O equivalente ao nó "Switch")
  let agenteAtual = sessao.agente_atual;
  
  // Se ainda não temos uma especialidade definida, chamamos o Roteador primeiro
  if (agenteAtual === 'orquestrador' || !agenteAtual) {
    const respostaRoteador = await chamarLLMComCascata(
      PROMPT_ROTEADOR, 
      [{ role: 'user', content: mensagemUsuario }]
    );
    
    try {
      const intencaoJSON = JSON.parse(respostaRoteador.conteudo);
      agenteAtual = intencaoJSON.intencao || 'duvidas_gerais';
      
      // Atualiza o estado da sessão no banco de dados com o novo agente
      await atualizarSessao(sessao.id, sessao.status, sessao.dados_coletados, sessao.dados_pendentes, agenteAtual);
      sessao.agente_atual = agenteAtual;

      console.log(`[Orquestrador] Intenção classificada como: ${agenteAtual}`);
    } catch (error) {
      console.error("[Orquestrador] Falha ao fazer parse do Roteador, caindo para dúvidas gerais.");
      agenteAtual = 'duvidas_gerais';
    }
  }

  // 2. Prepara o contexto da conversa
  const historicoBruto = await buscarHistoricoSessao(sessao.id);
  const historicoFormatado = historicoBruto.map((msg: any) => ({
    role: msg.remetente === 'profissional' ? 'user' : 'assistant',
    content: msg.conteudo
  }));
  historicoFormatado.push({ role: 'user', content: mensagemUsuario });

  // 3. Seleciona o Prompt Especialista correto
  let systemPrompt = PROMPT_GERAL; // Fallback
  
  switch (agenteAtual) {
    case 'cardiologia':
      systemPrompt = PROMPT_CARDIOLOGIA;
      break;
    case 'dermatologia':
      systemPrompt = PROMPT_DERMATOLOGIA;
      break;
    case 'endocrinologia':
      systemPrompt = PROMPT_ENDOCRINOLOGIA;
      break;
    case 'duvidas_gerais':
      systemPrompt = PROMPT_GERAL;
      break;
  }

  // 3.5 Busca só os trechos relevantes da Nota Técnica (RAG vetorial), em vez de
  // injetar o documento inteiro — mantém o prompt pequeno e evita respostas cortadas.
  const { contexto: notaTecnica, fontes: fontesRag } = await buscarContexto(mensagemUsuario, agenteAtual);

  if (notaTecnica) {
    systemPrompt += `\n\n[CONTEXTO CLÍNICO OFICIAL - NOTAS TÉCNICAS DA SES-DF]
Abaixo estão os trechos mais relevantes das diretrizes oficiais de regulação para esta especialidade.
Você é estritamente obrigado a utilizar estas informações para validar os critérios do paciente. Não invente regras que não estejam citadas abaixo:

${notaTecnica}`;
  } else if (agenteAtual !== 'duvidas_gerais') {
    console.warn(`[Orquestrador] Nenhum trecho de Nota Técnica recuperado para o agente "${agenteAtual}".`);
  }

  // 4. Dispara a requisição para o Agente Especialista no OpenRouter
  const respostaIA = await chamarLLMComCascata(systemPrompt, historicoFormatado);

  // 5. Tratamento rigoroso do JSON de saída (Substitui o nó de Código do n8n)
  let respostaEstruturada;
  try {
    console.log("[Orquestrador][DEBUG] JSON bruto do especialista:", respostaIA.conteudo);
    respostaEstruturada = JSON.parse(respostaIA.conteudo);
    
    // Normalização das chaves para garantir que batem com nosso banco
    return {
      texto_resposta: respostaEstruturada.texto_resposta || "Sem resposta.",
      novo_status: respostaEstruturada.status || 'PENDENTE',
      dados_coletados: { ...sessao.dados_coletados, ...(respostaEstruturada.dados_coletados_ate_o_momento || {}) },
      dados_pendentes: respostaEstruturada.dados_pendentes || [],
      agente_atual: agenteAtual,
      fontes_rag: fontesRag,
      telemetria: {
        modelo_usado: respostaIA.modelo_usado,
        tokens_prompt: respostaIA.tokens_prompt,
        tokens_resposta: respostaIA.tokens_resposta
      }
    };
  } catch (error) {
    console.error("[Orquestrador] Falha no JSON final do agente especialista:", respostaIA.conteudo);
    return {
      texto_resposta: "Houve uma falha na estruturação clínica. Poderia repetir a última informação, por favor?",
      novo_status: 'PENDENTE',
      dados_coletados: sessao.dados_coletados,
      dados_pendentes: sessao.dados_pendentes,
      agente_atual: agenteAtual,
      fontes_rag: fontesRag,
      telemetria: { modelo_usado: respostaIA.modelo_usado, tokens_prompt: 0, tokens_resposta: 0 }
    };
  }
}