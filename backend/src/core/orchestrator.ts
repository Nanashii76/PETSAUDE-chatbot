import { atualizarSessao, salvarEncaminhamento, registrarEvento } from '../services/database.js';
import { chamarLLMComCascata } from '../services/openrouter.js';
import { buscarContexto } from '../services/rag.js';
import {
  PROMPT_ROTEADOR,
  PROMPT_CARDIOLOGIA,
  PROMPT_DERMATOLOGIA,
  PROMPT_ENDOCRINOLOGIA,
  PROMPT_GERAL,
  AVISO_URGENCIA
} from './prompts.js';
import { limparDadosColetados, valorVazio } from './dadosColetados.js';

const ESPECIALIDADES = ['cardiologia', 'dermatologia', 'endocrinologia'];

// Resumo do que será usado no texto final, montado em código (não pelo LLM) a partir das chaves já
// extraídas em dados_coletados — é a comparação "o que foi capturado" que o profissional confirma
// antes de qualquer texto de encaminhamento ser gerado de fato.
function construirResumoConfirmacao(dadosColetados: Record<string, any>, corRisco: string | null): string {
  const linhas = Object.entries(dadosColetados)
    .filter(([chave, valor]) => !chave.startsWith('_') && !valorVazio(valor))
    .map(([chave, valor]) => `- ${chave}: ${typeof valor === 'object' ? JSON.stringify(valor) : valor}`);
  if (corRisco) {
    linhas.push(`- Classificação de risco: ${corRisco}`);
  }
  return (
    'Antes de gerar o texto final, confira os dados que serão usados no encaminhamento:\n\n' +
    linhas.join('\n') +
    '\n\nEstá tudo certo?'
  );
}

export async function processarMensagemLLM(sessao: any, mensagemUsuario: string, interlocutorId: string | null = null) {
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

      // Evento para o painel: um "caso" de verdade (não duvidas_gerais), contado uma vez por
      // sessão nova — sem texto de caso, só o fato de que uma condição começou a ser investigada.
      if (sessao.nova && ESPECIALIDADES.includes(agenteAtual)) {
        await registrarEvento('caso_iniciado', agenteAtual, sessao.id, interlocutorId);
      }
    } catch (error) {
      console.error("[Orquestrador] Falha ao fazer parse do Roteador, caindo para dúvidas gerais.");
      agenteAtual = 'duvidas_gerais';
    }
  }

  // Confirmação final pendente: o turno anterior já tinha tudo pronto (critérios + cor de risco) e
  // mostrou um resumo pedindo "Confirmar e gerar texto" / "Preciso corrigir algo". A resposta a essa
  // pergunta é uma decisão de código — não precisa (nem deve) gastar outra chamada ao LLM só pra
  // interpretar um "sim" ou "não".
  if (sessao.dados_coletados?._aguardando_confirmacao_final) {
    const confirmou = /confirmar/i.test(mensagemUsuario);
    const dadosColetados = { ...sessao.dados_coletados };
    const textoFinalPendente = dadosColetados._texto_final_pendente;
    const corFinalPendente: string | null = dadosColetados._cor_final_pendente ?? null;
    delete dadosColetados._aguardando_confirmacao_final;
    delete dadosColetados._texto_final_pendente;
    delete dadosColetados._cor_final_pendente;

    if (confirmou) {
      if (ESPECIALIDADES.includes(agenteAtual)) {
        await salvarEncaminhamento(sessao.id, agenteAtual, corFinalPendente, textoFinalPendente, dadosColetados, true);
        await registrarEvento('texto_gerado', agenteAtual, sessao.id, interlocutorId, { cor_risco: corFinalPendente });
      }
      return {
        texto_resposta: textoFinalPendente,
        novo_status: 'FINALIZADO',
        dados_coletados: dadosColetados,
        dados_pendentes: [],
        cor_risco: corFinalPendente,
        agente_atual: agenteAtual,
        fontes_rag: [],
        opcoes: [],
        telemetria: { modelo_usado: 'nenhum (confirmação local)', tokens_prompt: 0, tokens_resposta: 0 }
      };
    }

    return {
      texto_resposta: 'Sem problema — descreva o que você gostaria de corrigir ou adicionar, e eu ajusto antes de gerar o texto final.',
      novo_status: 'PENDENTE',
      dados_coletados: dadosColetados,
      dados_pendentes: sessao.dados_pendentes,
      cor_risco: null,
      agente_atual: agenteAtual,
      fontes_rag: [],
      opcoes: [],
      telemetria: { modelo_usado: 'nenhum (correção local)', tokens_prompt: 0, tokens_resposta: 0 }
    };
  }

  // 2. Seleciona o Prompt Especialista correto
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

  // Turno anterior perguntou a cor de risco (NT não define uma para o critério atendido) — a
  // mensagem atual é a resposta a essa pergunta (ex: "Verde"), não um novo fato clínico solto.
  // Calculado antes do RAG: uma resposta de uma palavra não tem sinal clínico nenhum para a busca
  // vetorial — sozinha, ela pode recuperar um trecho da NT completamente errado (achado ao vivo:
  // "Verde" sem contexto recuperou Taquiarritmia em vez de Insuficiência Cardíaca). Juntar com o
  // estado já coletado dá à busca o mesmo sinal clínico que a pergunta original tinha.
  const aguardandoCor = !!sessao.dados_coletados?._aguardando_cor;
  const consultaRag = aguardandoCor
    ? `${JSON.stringify(sessao.dados_coletados || {})} ${mensagemUsuario}`
    : mensagemUsuario;

  // 3. Busca só os trechos relevantes da Nota Técnica (RAG vetorial) e a checklist de campos
  // obrigatórios já extraída na ingestão — em vez de injetar o documento inteiro e deixar o LLM
  // reler o parágrafo pra inferir os requisitos de novo em todo turno.
  const { contexto: notaTecnica, fontes: fontesRag, camposMinimos } = await buscarContexto(consultaRag, agenteAtual);

  if (notaTecnica) {
    systemPrompt += `\n\n[CONTEXTO CLÍNICO OFICIAL - NOTAS TÉCNICAS DA SES-DF]
Abaixo estão os trechos mais relevantes das diretrizes oficiais de regulação para esta especialidade.
Você é estritamente obrigado a utilizar estas informações para validar os critérios do paciente. Não invente regras que não estejam citadas abaixo:

${notaTecnica}`;
  } else if (agenteAtual !== 'duvidas_gerais') {
    console.warn(`[Orquestrador] Nenhum trecho de Nota Técnica recuperado para o agente "${agenteAtual}".`);
  }

  if (camposMinimos.length > 0) {
    systemPrompt += `\n\n[CAMPOS OBRIGATÓRIOS]
${camposMinimos.map((campo) => `- ${campo}`).join('\n')}`;
  }

  // O estado já coletado substitui o histórico completo da conversa: o LLM não precisa reler
  // todas as mensagens anteriores para saber o que já foi confirmado, só o que está aqui.
  systemPrompt += `\n\n[ESTADO ATUAL DA COLETA]
${JSON.stringify(sessao.dados_coletados || {})}`;

  if (aguardandoCor) {
    systemPrompt += `\n\n[PERGUNTA PENDENTE]
Você perguntou ao profissional a classificação de risco (Amarela, Verde, Azul ou Vermelha), pois a Nota Técnica não define uma cor fixa para o critério já atendido. A mensagem a seguir é a resposta a essa pergunta: use-a como "cor_risco". Se os demais campos obrigatórios já estiverem completos, pode finalizar (status FINALIZADO) com essa cor.`;
  }

  // 4. Dispara a requisição para o Agente Especialista no OpenRouter — só a mensagem atual,
  // sem o histórico completo (que crescia a cada turno e inflava o consumo de tokens).
  const respostaIA = await chamarLLMComCascata(systemPrompt, [{ role: 'user', content: mensagemUsuario }]);

  // 5. Tratamento rigoroso do JSON de saída (Substitui o nó de Código do n8n)
  let respostaEstruturada;
  try {
    console.log("[Orquestrador][DEBUG] JSON bruto do especialista:", respostaIA.conteudo);
    respostaEstruturada = JSON.parse(respostaIA.conteudo);

    // Alguns modelos da cascata, raramente, devolvem um JSON tecnicamente válido mas vazio/degenerado
    // (ex: {"": ""}) — JSON.parse não detecta isso como erro. Sem essa checagem, o profissional via
    // "Sem resposta." sem explicação nem orientação para tentar de novo.
    if (!respostaEstruturada.status || !respostaEstruturada.texto_resposta) {
      throw new Error(`Resposta do especialista incompleta/vazia: ${respostaIA.conteudo}`);
    }

    let novoStatus = respostaEstruturada.status || 'PENDENTE';
    let textoResposta = respostaEstruturada.texto_resposta || "Sem resposta.";
    let dadosPendentes = respostaEstruturada.dados_pendentes || [];
    let opcoes: string[] = [];
    const corRisco: string | null = valorVazio(respostaEstruturada.cor_risco) ? null : respostaEstruturada.cor_risco;
    const dadosColetados = limparDadosColetados({
      ...sessao.dados_coletados,
      ...(respostaEstruturada.dados_coletados_ate_o_momento || {}),
    });

    // Urgência: o alerta é sempre o texto fixo do código, nunca a redação do LLM — e só aparece
    // uma vez por sessão, mesmo que o modelo sinalize urgencia:true de novo em turnos seguintes.
    if (respostaEstruturada.urgencia && !sessao.dados_coletados?._urgencia_mostrada) {
      textoResposta = `${AVISO_URGENCIA}\n\n${textoResposta}`;
      dadosColetados._urgencia_mostrada = true;
      await registrarEvento('urgencia', agenteAtual, sessao.id, interlocutorId);
    }

    if (aguardandoCor) {
      // A mensagem atual já respondeu à pergunta de cor (seja com uma cor válida ou não) — não
      // perguntar de novo, para não travar o profissional num loop.
      delete dadosColetados._aguardando_cor;
    } else if (novoStatus === 'FINALIZADO' && !corRisco && !sessao.dados_coletados?._cor_risco_perguntada) {
      novoStatus = 'PENDENTE';
      dadosColetados._aguardando_cor = true;
      dadosColetados._cor_risco_perguntada = true;
      textoResposta =
        'A Nota Técnica não define uma classificação de risco fixa para este critério. Antes de finalizar, ' +
        'qual a classificação de risco deste caso: Amarela, Verde ou Azul?';
      dadosPendentes = ['Classificação de risco (Amarela, Verde ou Azul)'];
      opcoes = ['Amarela', 'Verde', 'Azul', 'Vermelha'];
    }

    // O especialista decidiu finalizar (critérios atendidos e cor de risco já resolvida, seja pela
    // NT ou pela pergunta acima) — mas não finaliza ainda: mostra um resumo do que foi capturado e
    // pede confirmação antes de gravar o encaminhamento de verdade. O texto que o LLM já gerou aqui
    // é reaproveitado depois (sem chamar o modelo de novo) se o profissional confirmar.
    if (novoStatus === 'FINALIZADO' && !dadosColetados._aguardando_cor) {
      dadosColetados._aguardando_confirmacao_final = true;
      dadosColetados._texto_final_pendente = textoResposta;
      dadosColetados._cor_final_pendente = corRisco;
      novoStatus = 'PENDENTE';
      textoResposta = construirResumoConfirmacao(dadosColetados, corRisco);
      dadosPendentes = [];
      opcoes = ['Confirmar e gerar texto', 'Preciso corrigir algo'];
    }

    // NAO_ELEGIVEL não passa por confirmação (não gera texto de encaminhamento) — grava direto.
    if (novoStatus === 'NAO_ELEGIVEL' && ESPECIALIDADES.includes(agenteAtual)) {
      await salvarEncaminhamento(sessao.id, agenteAtual, corRisco, textoResposta, dadosColetados, false);
      await registrarEvento('nao_elegivel', agenteAtual, sessao.id, interlocutorId, { cor_risco: corRisco });
    }

    return {
      texto_resposta: textoResposta,
      novo_status: novoStatus,
      dados_coletados: dadosColetados,
      dados_pendentes: dadosPendentes,
      cor_risco: corRisco,
      agente_atual: agenteAtual,
      fontes_rag: fontesRag,
      opcoes,
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
      cor_risco: null,
      agente_atual: agenteAtual,
      fontes_rag: fontesRag,
      opcoes: [],
      telemetria: {
        modelo_usado: respostaIA.modelo_usado,
        tokens_prompt: respostaIA.tokens_prompt,
        tokens_resposta: respostaIA.tokens_resposta
      }
    };
  }
}