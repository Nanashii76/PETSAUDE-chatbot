import {
  buscarEventosParaPainel,
  buscarSessoesParaPainel,
  buscarTelemetriaModelos,
  type LinhaPainel,
  type LinhaSessaoPainel,
  type LinhaTelemetriaModelo,
} from '../services/database.js';
import { FALLBACK_CASCADE } from '../services/openrouter.js';
import { porCnes } from './unidades.js';
import { valorVazio } from './dadosColetados.js';

export type PeriodoPainel = '7' | '30' | 'tudo';

const DIAS_POR_PERIODO: Record<PeriodoPainel, number | null> = { '7': 7, '30': 30, tudo: null };

export type LinhaEspecialidade = {
  especialidade: string;
  casos: number;
  textos: number;
  naoElegiveis: number;
  cores: Record<string, number>;
};

export type LinhaLugar = { nome: string; regiao: string | null; casos: number };

export type PontoSerie = { dia: string; casos: number; textos: number; naoElegiveis: number };

export type LinhaModelo = { modelo: string; respostas: number; tokensPrompt: number; tokensResposta: number };

export type Painel = {
  periodo: PeriodoPainel;
  casos: number;
  textos: number;
  naoElegiveis: number;
  urgencias: number;
  cores: Record<string, number>;
  especialidades: LinhaEspecialidade[];
  unidades: LinhaLugar[];
  regioes: LinhaLugar[];
  serie: PontoSerie[];
  uso: {
    respostasLLM: number;
    respostasFallback: number;
    tokensPrompt: number;
    tokensResposta: number;
    tokensPorEncaminhamento: number | null;
    modelos: LinhaModelo[];
  };
  fluxo: {
    minutosMedioAteFinalizar: number | null;
    turnosMedioPorCaso: number | null;
    emAndamento: number;
    abandonados: number;
  };
  qualidade: {
    coresPorOrigem: { rag: number; manual: number };
    ragComNota: number;
    ragVazio: number;
  };
  regulacao: {
    pedidosAnalisados: number;
    devolucoes: number;
    consultas: number;
    pareceAtender: { sim: number; nao: number; indefinido: number };
    camposFaltantes: { campo: string; vezes: number }[];
  };
};

export type ExtrasPainel = {
  telemetria?: LinhaTelemetriaModelo[];
  sessoes?: LinhaSessaoPainel[];
  agora?: Date;
};

// Sessão PENDENTE sem nenhuma atividade há mais que isso é tratada como abandonada, mesmo que o
// profissional nunca tenha clicado em "Nova triagem" (que é o que marca status = 'ABANDONADA').
const HORAS_ATE_ABANDONO = 24;

const FUSO_PAINEL = 'America/Sao_Paulo';

// "YYYY-MM-DD" no fuso do DF — um caso às 22h não pode cair no dia seguinte por causa do UTC.
function diaLocal(data: Date): string {
  return new Date(data).toLocaleDateString('en-CA', { timeZone: FUSO_PAINEL });
}

function proximoDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1, 12)).toISOString().slice(0, 10);
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round((10 * valores.reduce((a, b) => a + b, 0)) / valores.length) / 10;
}

// Série diária contínua (dias sem evento entram com zero, senão o gráfico "pula" os buracos).
// Começa no início da janela do período, ou no primeiro evento quando o período é "tudo".
function montarSerie(linhas: LinhaPainel[], periodo: PeriodoPainel, agora: Date): PontoSerie[] {
  const porDia = new Map<string, PontoSerie>();
  for (const ev of linhas) {
    if (!ev.especialidade) continue;
    const campo =
      ev.tipo === 'caso_iniciado' ? 'casos' : ev.tipo === 'texto_gerado' ? 'textos' : ev.tipo === 'nao_elegivel' ? 'naoElegiveis' : null;
    if (!campo) continue;
    const dia = diaLocal(ev.criado_em);
    if (!porDia.has(dia)) porDia.set(dia, { dia, casos: 0, textos: 0, naoElegiveis: 0 });
    porDia.get(dia)![campo] += 1;
  }

  const dias = DIAS_POR_PERIODO[periodo];
  const hoje = diaLocal(agora);
  const inicio = dias
    ? diaLocal(new Date(agora.getTime() - (dias - 1) * 24 * 60 * 60 * 1000))
    : [...porDia.keys()].sort()[0];
  if (!inicio) return [];

  const serie: PontoSerie[] = [];
  for (let dia = inicio; dia <= hoje; dia = proximoDia(dia)) {
    serie.push(porDia.get(dia) || { dia, casos: 0, textos: 0, naoElegiveis: 0 });
  }
  return serie;
}

function agregarUso(telemetria: LinhaTelemetriaModelo[], textos: number): Painel['uso'] {
  const modelos: LinhaModelo[] = [];
  let tokensPrompt = 0;
  let tokensResposta = 0;
  for (const t of telemetria) {
    tokensPrompt += t.tokens_prompt;
    tokensResposta += t.tokens_resposta;
    // Respostas montadas em código ("nenhum (confirmação local)" etc.) não passaram por modelo.
    if (!t.modelo_usado || t.modelo_usado.startsWith('nenhum')) continue;
    modelos.push({
      modelo: t.modelo_usado,
      respostas: t.respostas,
      tokensPrompt: t.tokens_prompt,
      tokensResposta: t.tokens_resposta,
    });
  }
  modelos.sort((a, b) => b.respostas - a.respostas);
  const respostasLLM = modelos.reduce((a, m) => a + m.respostas, 0);
  // Qualquer resposta que não veio do 1º modelo da cascata é uma em que ele falhou (429, timeout,
  // JSON degenerado) e a cascata caiu para o seguinte.
  const respostasFallback = modelos.filter((m) => m.modelo !== FALLBACK_CASCADE[0]).reduce((a, m) => a + m.respostas, 0);
  return {
    respostasLLM,
    respostasFallback,
    tokensPrompt,
    tokensResposta,
    tokensPorEncaminhamento: textos > 0 ? Math.round((tokensPrompt + tokensResposta) / textos) : null,
    modelos,
  };
}

function periodoValido(periodo: string): PeriodoPainel {
  return periodo === '7' || periodo === '30' ? periodo : 'tudo';
}

// Compartilhado com core/encaminhamentos.ts — mesmo recorte de período do painel, para o período
// escolhido na UI valer tanto para as métricas quanto para a lista de encaminhamentos.
export function periodoParaDesde(periodoBruto: string): { periodo: PeriodoPainel; desde: Date | null } {
  const periodo = periodoValido(periodoBruto);
  const dias = DIAS_POR_PERIODO[periodo];
  const desde = dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : null;
  return { periodo, desde };
}

export function agregar(linhas: LinhaPainel[], periodo: PeriodoPainel, extras: ExtrasPainel = {}): Painel {
  const agora = extras.agora ?? new Date();
  const p: Painel = {
    periodo,
    casos: 0,
    textos: 0,
    naoElegiveis: 0,
    urgencias: 0,
    cores: {},
    especialidades: [],
    unidades: [],
    regioes: [],
    serie: [],
    uso: agregarUso([], 0),
    fluxo: { minutosMedioAteFinalizar: null, turnosMedioPorCaso: null, emAndamento: 0, abandonados: 0 },
    qualidade: { coresPorOrigem: { rag: 0, manual: 0 }, ragComNota: 0, ragVazio: 0 },
    regulacao: {
      pedidosAnalisados: 0,
      devolucoes: 0,
      consultas: 0,
      pareceAtender: { sim: 0, nao: 0, indefinido: 0 },
      camposFaltantes: [],
    },
  };

  // Início e fim (texto gerado ou não elegível) de cada caso, por sessão.
  const inicioPorSessao = new Map<string, Date>();
  const fimPorSessao = new Map<string, { tipo: string; em: Date }>();
  const faltantes = new Map<string, number>();

  const porEspecialidade = new Map<string, LinhaEspecialidade>();
  const porUnidade = new Map<string, LinhaLugar>();
  const porRegiao = new Map<string, LinhaLugar>();

  function especialidade(nome: string): LinhaEspecialidade {
    if (!porEspecialidade.has(nome)) {
      porEspecialidade.set(nome, { especialidade: nome, casos: 0, textos: 0, naoElegiveis: 0, cores: {} });
    }
    return porEspecialidade.get(nome)!;
  }

  for (const ev of linhas) {
    if (ev.sessao_id && ev.tipo === 'caso_iniciado') inicioPorSessao.set(ev.sessao_id, new Date(ev.criado_em));
    if (ev.sessao_id && (ev.tipo === 'texto_gerado' || ev.tipo === 'nao_elegivel')) {
      fimPorSessao.set(ev.sessao_id, { tipo: ev.tipo, em: new Date(ev.criado_em) });
    }

    if (ev.tipo === 'caso_iniciado' && ev.especialidade) {
      p.casos += 1;
      especialidade(ev.especialidade).casos += 1;
    } else if (ev.tipo === 'texto_gerado' && ev.especialidade) {
      p.textos += 1;
      especialidade(ev.especialidade).textos += 1;
      // Registros antigos já guardaram a string literal "null" em vez do JSON null de verdade (o
      // mesmo problema que dadosColetados.ts existe para evitar) — sem este filtro, ela aparece
      // como se fosse uma cor de risco de verdade no gráfico do painel.
      const cor = ev.dados?.cor_risco;
      if (!valorVazio(cor)) {
        p.cores[cor] = (p.cores[cor] || 0) + 1;
        especialidade(ev.especialidade).cores[cor] = (especialidade(ev.especialidade).cores[cor] || 0) + 1;
      }
      // Eventos anteriores ao campo origem_cor não entram em nenhuma das duas contagens.
      const origem: unknown = ev.dados?.origem_cor;
      if (origem === 'rag' || origem === 'manual') p.qualidade.coresPorOrigem[origem] += 1;
    } else if (ev.tipo === 'nao_elegivel' && ev.especialidade) {
      p.naoElegiveis += 1;
      especialidade(ev.especialidade).naoElegiveis += 1;
    } else if (ev.tipo === 'urgencia') {
      p.urgencias += 1;
    } else if (ev.tipo === 'rag_vazio') {
      p.qualidade.ragVazio += 1;
    } else if (ev.tipo === 'pedido_analisado') {
      p.regulacao.pedidosAnalisados += 1;
      const veredito = ev.dados?.parece_atender_criterio;
      p.regulacao.pareceAtender[veredito === true ? 'sim' : veredito === false ? 'nao' : 'indefinido'] += 1;
      for (const campo of Array.isArray(ev.dados?.campos_faltantes) ? ev.dados.campos_faltantes : []) {
        if (typeof campo !== 'string' || valorVazio(campo)) continue;
        faltantes.set(campo, (faltantes.get(campo) || 0) + 1);
      }
    } else if (ev.tipo === 'devolucao_redigida') {
      p.regulacao.devolucoes += 1;
    } else if (ev.tipo === 'consulta_criterio') {
      p.regulacao.consultas += 1;
    }

    // Recorte por unidade/região — só para eventos que marcam um caso de verdade (não duvidas_gerais).
    if (ev.unidade_cnes && (ev.tipo === 'caso_iniciado' || ev.tipo === 'texto_gerado' || ev.tipo === 'nao_elegivel')) {
      const unidade = porCnes(ev.unidade_cnes);
      const nomeUnidade = unidade?.nome || ev.unidade_cnes;
      const regiao = unidade?.regiao || null;

      if (!porUnidade.has(ev.unidade_cnes)) {
        porUnidade.set(ev.unidade_cnes, { nome: nomeUnidade, regiao, casos: 0 });
      }
      porUnidade.get(ev.unidade_cnes)!.casos += 1;

      const chaveRegiao = regiao || 'Não informada';
      if (!porRegiao.has(chaveRegiao)) {
        porRegiao.set(chaveRegiao, { nome: chaveRegiao, regiao: chaveRegiao, casos: 0 });
      }
      porRegiao.get(chaveRegiao)!.casos += 1;
    }
  }

  p.especialidades = [...porEspecialidade.values()].sort((a, b) => b.casos - a.casos);
  p.unidades = [...porUnidade.values()].sort((a, b) => b.casos - a.casos).slice(0, 10);
  p.regioes = [...porRegiao.values()].sort((a, b) => b.casos - a.casos);
  p.regulacao.camposFaltantes = [...faltantes.entries()]
    .map(([campo, vezes]) => ({ campo, vezes }))
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, 10);

  p.serie = montarSerie(linhas, periodo, agora);

  const telemetria = extras.telemetria ?? [];
  p.uso = agregarUso(telemetria, p.textos);
  p.qualidade.ragComNota = telemetria.reduce((a, t) => a + t.com_fontes_rag, 0);

  // Tempo até finalizar: só casos cujo início e fim caíram dentro da janela, e que terminaram em
  // texto gerado (não elegível encerra o caso, mas não é "finalizar um encaminhamento").
  const minutos: number[] = [];
  for (const [sessaoId, fim] of fimPorSessao) {
    const inicio = inicioPorSessao.get(sessaoId);
    if (inicio && fim.tipo === 'texto_gerado') minutos.push((fim.em.getTime() - inicio.getTime()) / 60000);
  }
  p.fluxo.minutosMedioAteFinalizar = media(minutos);

  const sessoes = new Map((extras.sessoes ?? []).map((s) => [s.sessao_id, s]));
  const turnos: number[] = [];
  for (const [sessaoId, fim] of fimPorSessao) {
    const sessao = sessoes.get(sessaoId);
    if (sessao && fim.tipo === 'texto_gerado') turnos.push(sessao.turnos);
  }
  p.fluxo.turnosMedioPorCaso = media(turnos);

  // Casos iniciados na janela que ainda não terminaram em texto nem em não elegível.
  const limiteAbandono = agora.getTime() - HORAS_ATE_ABANDONO * 60 * 60 * 1000;
  for (const sessaoId of inicioPorSessao.keys()) {
    if (fimPorSessao.has(sessaoId)) continue;
    const sessao = sessoes.get(sessaoId);
    if (!sessao) continue;
    if (sessao.status === 'ABANDONADA') p.fluxo.abandonados += 1;
    else if (sessao.status === 'PENDENTE') {
      if (new Date(sessao.atualizado_em).getTime() < limiteAbandono) p.fluxo.abandonados += 1;
      else p.fluxo.emAndamento += 1;
    }
  }

  return p;
}

export async function montarPainel(periodoBruto: string): Promise<Painel> {
  const { periodo, desde } = periodoParaDesde(periodoBruto);
  const linhas = await buscarEventosParaPainel(desde);
  const sessaoIds = [...new Set(linhas.map((l) => l.sessao_id).filter((id): id is string => !!id))];
  const [telemetria, sessoes] = await Promise.all([buscarTelemetriaModelos(desde), buscarSessoesParaPainel(sessaoIds)]);
  return agregar(linhas, periodo, { telemetria, sessoes });
}
