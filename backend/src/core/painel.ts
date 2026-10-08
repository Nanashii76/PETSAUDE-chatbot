import { buscarEventosParaPainel, type LinhaPainel } from '../services/database.js';
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
};

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

export function agregar(linhas: LinhaPainel[], periodo: PeriodoPainel): Painel {
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
  };

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
    } else if (ev.tipo === 'nao_elegivel' && ev.especialidade) {
      p.naoElegiveis += 1;
      especialidade(ev.especialidade).naoElegiveis += 1;
    } else if (ev.tipo === 'urgencia') {
      p.urgencias += 1;
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

  return p;
}

export async function montarPainel(periodoBruto: string): Promise<Painel> {
  const { periodo, desde } = periodoParaDesde(periodoBruto);
  const linhas = await buscarEventosParaPainel(desde);
  return agregar(linhas, periodo);
}
