import { chamarLLMComCascata } from '../services/openrouter.js';
import { buscarContexto } from '../services/rag.js';
import {
  PROMPT_REGULACAO_IDENTIFICAR,
  PROMPT_REGULACAO_ANALISE_CARDIOLOGIA,
  PROMPT_REGULACAO_ANALISE_DERMATOLOGIA,
  PROMPT_REGULACAO_ANALISE_ENDOCRINOLOGIA,
} from './prompts.js';

// Assistente do regulador: analisa um pedido de encaminhamento já recebido (ou responde uma
// consulta sobre critérios) — o inverso do fluxo de encaminhamento da APS em orchestrator.ts, que
// conversa coletando dados. Aqui não há conversa: cada "pedido" é uma análise de uma vez só.

const PROMPT_ANALISE_POR_ESPECIALIDADE: Record<string, string> = {
  cardiologia: PROMPT_REGULACAO_ANALISE_CARDIOLOGIA,
  dermatologia: PROMPT_REGULACAO_ANALISE_DERMATOLOGIA,
  endocrinologia: PROMPT_REGULACAO_ANALISE_ENDOCRINOLOGIA,
};

const ROTULO_ESPECIALIDADE: Record<string, string> = {
  cardiologia: 'Cardiologia',
  dermatologia: 'Dermatologia',
  endocrinologia: 'Endocrinologia',
};

const NOTA_TECNICA_POR_ESPECIALIDADE: Record<string, string> = {
  cardiologia: 'Nota Técnica nº 04/2018',
  dermatologia: 'Nota Técnica nº 22/2018',
  endocrinologia: 'Nota Técnica nº 08/2021',
};

const BOAS_VINDAS =
  'Modo Regulação. Cole o texto de um encaminhamento recebido para eu conferir os critérios e o ' +
  'conteúdo mínimo da Nota Técnica, ou pergunte algo como "quais os critérios para hipertensão?". ' +
  'A decisão final é sempre sua.';

type ResultadoRegulacao = {
  texto_resposta: string;
  dados_coletados: Record<string, any>;
  opcoes: string[];
  copiavel: string | null;
  telemetria: { modelo_usado: string; tokens_prompt: number; tokens_resposta: number };
};

function telemetriaLocal(etiqueta: string): ResultadoRegulacao['telemetria'] {
  return { modelo_usado: `nenhum (${etiqueta})`, tokens_prompt: 0, tokens_resposta: 0 };
}

function construirRelatorio(especialidade: string, analise: any, camposFaltantes: string[]): string {
  const linhas = [
    `**Análise do pedido — ${ROTULO_ESPECIALIDADE[especialidade]}** (${NOTA_TECNICA_POR_ESPECIALIDADE[especialidade]})`,
    '',
  ];
  const presentes: Record<string, any> = analise.campos_presentes || {};
  if (Object.keys(presentes).length > 0) {
    linhas.push('**Conteúdo mínimo presente no pedido:**');
    for (const [campo, valor] of Object.entries(presentes)) linhas.push(`- ${campo}: ${valor}`);
    linhas.push('');
  }
  if (camposFaltantes.length > 0) {
    linhas.push('**Conteúdo mínimo que falta no pedido:**');
    linhas.push(...camposFaltantes.map((c) => `- ${c}`));
    linhas.push('');
  }
  const situacao =
    analise.parece_atender_criterio === true
      ? 'pelos dados enviados, o pedido parece atender a um critério da NT'
      : analise.parece_atender_criterio === false
        ? 'pelos dados enviados, o pedido não parece atender aos critérios da NT'
        : 'os dados enviados não permitem confirmar um critério da NT';
  linhas.push(`**Avaliação:** ${situacao}.`);
  if (analise.observacoes) linhas.push(analise.observacoes);
  linhas.push('', 'A decisão é do regulador.');
  return linhas.join('\n');
}

function construirDevolucao(especialidade: string, camposFaltantes: string[]): string {
  const linhas = [
    `Devolução do encaminhamento — ${ROTULO_ESPECIALIDADE[especialidade]}`,
    `Referência: ${NOTA_TECNICA_POR_ESPECIALIDADE[especialidade]}.`,
    '',
  ];
  if (camposFaltantes.length > 0) {
    linhas.push('Para a regulação, o encaminhamento precisa trazer, conforme o conteúdo mínimo da Nota Técnica:');
    linhas.push(...camposFaltantes.map((c) => `- ${c}`));
  } else {
    linhas.push(
      'Pelos dados enviados, não foi possível confirmar que o caso atende aos critérios de encaminhamento da Nota Técnica.'
    );
  }
  linhas.push('', 'Após complementar, reenvie o encaminhamento.');
  return linhas.join('\n');
}

export async function processarMensagemRegulacao(sessao: any, mensagemUsuario: string): Promise<ResultadoRegulacao> {
  const texto = mensagemUsuario.trim();

  // "Novo pedido" e "Redigir devolução" são decisões de código — não precisam (nem devem) gastar
  // uma chamada ao LLM só pra reconhecer um clique de botão.
  if (/^novo pedido$/i.test(texto)) {
    return {
      texto_resposta: BOAS_VINDAS,
      dados_coletados: {},
      opcoes: [],
      copiavel: null,
      telemetria: telemetriaLocal('novo pedido'),
    };
  }

  if (/redigir devolução/i.test(texto) && sessao.dados_coletados?._ultima_analise) {
    const { especialidade, campos_faltantes } = sessao.dados_coletados._ultima_analise;
    return {
      texto_resposta: 'Devolução redigida. Confira, ajuste se precisar e copie para o retorno ao solicitante.',
      dados_coletados: sessao.dados_coletados,
      opcoes: ['Novo pedido'],
      copiavel: construirDevolucao(especialidade, campos_faltantes),
      telemetria: telemetriaLocal('devolução local'),
    };
  }

  const respostaIdentificar = await chamarLLMComCascata(PROMPT_REGULACAO_IDENTIFICAR, [{ role: 'user', content: texto }]);

  let identificado: any;
  try {
    identificado = JSON.parse(respostaIdentificar.conteudo);
    if (!identificado.tipo) throw new Error('sem "tipo" no JSON');
  } catch (error) {
    console.error('[Regulação] Falha ao identificar a mensagem:', respostaIdentificar.conteudo);
    return {
      texto_resposta: 'Não consegui identificar se isso é um pedido pra analisar ou uma consulta. Pode reformular?',
      dados_coletados: sessao.dados_coletados || {},
      opcoes: [],
      copiavel: null,
      telemetria: {
        modelo_usado: respostaIdentificar.modelo_usado,
        tokens_prompt: respostaIdentificar.tokens_prompt,
        tokens_resposta: respostaIdentificar.tokens_resposta,
      },
    };
  }

  const { tipo, especialidade } = identificado;
  const telemetriaIdentificar = {
    modelo_usado: respostaIdentificar.modelo_usado,
    tokens_prompt: respostaIdentificar.tokens_prompt,
    tokens_resposta: respostaIdentificar.tokens_resposta,
  };

  if (tipo === 'outro' || especialidade === 'indefinida' || !PROMPT_ANALISE_POR_ESPECIALIDADE[especialidade]) {
    return {
      texto_resposta: identificado.resposta || BOAS_VINDAS,
      dados_coletados: sessao.dados_coletados || {},
      opcoes: [],
      copiavel: null,
      telemetria: telemetriaIdentificar,
    };
  }

  const { contexto: notaTecnica, camposMinimos } = await buscarContexto(texto, especialidade);

  if (tipo === 'consulta') {
    const textoResposta = notaTecnica
      ? `**${ROTULO_ESPECIALIDADE[especialidade]} — critérios de encaminhamento:**\n\n${notaTecnica}` +
        (camposMinimos.length > 0
          ? `\n\n**Conteúdo mínimo do encaminhamento:**\n${camposMinimos.map((c) => `- ${c}`).join('\n')}`
          : '')
      : 'Não encontrei um trecho da Nota Técnica relevante para essa pergunta.';
    return {
      texto_resposta: textoResposta,
      dados_coletados: sessao.dados_coletados || {},
      opcoes: ['Novo pedido'],
      copiavel: null,
      telemetria: telemetriaIdentificar,
    };
  }

  // tipo === 'pedido'
  let systemAnalise = PROMPT_ANALISE_POR_ESPECIALIDADE[especialidade];
  if (notaTecnica) {
    systemAnalise += `\n\n[CONTEXTO CLÍNICO OFICIAL]\n${notaTecnica}`;
  }
  if (camposMinimos.length > 0) {
    systemAnalise += `\n\n[CAMPOS OBRIGATÓRIOS]\n${camposMinimos.map((c) => `- ${c}`).join('\n')}`;
  }

  const respostaAnalise = await chamarLLMComCascata(systemAnalise, [
    { role: 'user', content: `[Pedido de encaminhamento recebido]\n${texto}` },
  ]);

  let analise: any;
  try {
    analise = JSON.parse(respostaAnalise.conteudo);
  } catch (error) {
    console.error('[Regulação] Falha ao analisar o pedido:', respostaAnalise.conteudo);
    return {
      texto_resposta: 'Houve uma falha ao estruturar a análise do pedido. Poderia colar o texto de novo?',
      dados_coletados: sessao.dados_coletados || {},
      opcoes: [],
      copiavel: null,
      telemetria: {
        modelo_usado: respostaAnalise.modelo_usado,
        tokens_prompt: respostaAnalise.tokens_prompt,
        tokens_resposta: respostaAnalise.tokens_resposta,
      },
    };
  }

  const camposFaltantes: string[] = analise.campos_faltantes || [];
  const relatorio = construirRelatorio(especialidade, analise, camposFaltantes);

  return {
    texto_resposta: relatorio,
    dados_coletados: { _ultima_analise: { especialidade, campos_faltantes: camposFaltantes } },
    opcoes: camposFaltantes.length > 0 ? ['Redigir devolução', 'Novo pedido'] : ['Novo pedido'],
    copiavel: null,
    telemetria: {
      modelo_usado: respostaAnalise.modelo_usado,
      tokens_prompt: respostaAnalise.tokens_prompt,
      tokens_resposta: respostaAnalise.tokens_resposta,
    },
  };
}

export const BOAS_VINDAS_REGULACAO = BOAS_VINDAS;
