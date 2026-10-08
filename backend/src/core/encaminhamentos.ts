import { buscarEncaminhamentosRecentes, buscarEncaminhamentoPorId } from '../services/database.js';
import { porCnes } from './unidades.js';
import { periodoParaDesde } from './painel.js';
import { valorVazio } from './dadosColetados.js';

// Drill-down do painel: "qual foi o encaminhamento gerado para esta conversa?" — lista leve
// (sem o texto) para a tabela, e um detalhe por id com o texto completo, buscado sob demanda.

export type ResumoEncaminhamento = {
  id: string;
  sessaoId: string;
  especialidade: string;
  classificacaoRisco: string | null;
  elegivel: boolean;
  criadoEm: string;
  profissional: string;
  unidade: string;
};

export type DetalheEncaminhamento = {
  id: string;
  especialidade: string;
  classificacaoRisco: string | null;
  elegivel: boolean;
  criadoEm: string;
  resumoSisreg: string;
};

export async function listarEncaminhamentos(periodoBruto: string): Promise<ResumoEncaminhamento[]> {
  const { desde } = periodoParaDesde(periodoBruto);
  const linhas = await buscarEncaminhamentosRecentes(desde);

  return linhas.map((l) => ({
    id: l.id,
    sessaoId: l.sessao_id,
    especialidade: l.especialidade,
    classificacaoRisco: valorVazio(l.classificacao_risco) ? null : l.classificacao_risco,
    elegivel: l.elegivel,
    criadoEm: l.criado_em.toISOString(),
    profissional: valorVazio(l.profissional_nome) ? 'Não identificado' : l.profissional_nome!,
    unidade: (l.unidade_cnes && porCnes(l.unidade_cnes)?.nome) || 'Não informada',
  }));
}

export async function buscarDetalheEncaminhamento(id: string): Promise<DetalheEncaminhamento | null> {
  const linha = await buscarEncaminhamentoPorId(id);
  if (!linha) return null;

  return {
    id: linha.id,
    especialidade: linha.especialidade,
    classificacaoRisco: valorVazio(linha.classificacao_risco) ? null : linha.classificacao_risco,
    elegivel: linha.elegivel,
    criadoEm: linha.criado_em.toISOString(),
    resumoSisreg: valorVazio(linha.resumo_sisreg) ? 'Nenhum texto registrado para este encaminhamento.' : linha.resumo_sisreg!,
  };
}
