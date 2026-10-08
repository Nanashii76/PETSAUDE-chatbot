import { describe, it, expect, vi, beforeEach } from 'vitest';

const { buscarEncaminhamentosRecentesMock, buscarEncaminhamentoPorIdMock } = vi.hoisted(() => ({
  buscarEncaminhamentosRecentesMock: vi.fn(),
  buscarEncaminhamentoPorIdMock: vi.fn(),
}));

vi.mock('../../services/database.js', () => ({
  buscarEncaminhamentosRecentes: buscarEncaminhamentosRecentesMock,
  buscarEncaminhamentoPorId: buscarEncaminhamentoPorIdMock,
}));

const { listarEncaminhamentos, buscarDetalheEncaminhamento } = await import('../../core/encaminhamentos.js');

describe('listarEncaminhamentos', () => {
  beforeEach(() => {
    buscarEncaminhamentosRecentesMock.mockReset();
  });

  it('preenche profissional e unidade com rótulos legíveis quando ausentes, nunca null/undefined', async () => {
    buscarEncaminhamentosRecentesMock.mockResolvedValue([
      {
        id: 'e1',
        sessao_id: 's1',
        especialidade: 'cardiologia',
        classificacao_risco: 'Amarela',
        elegivel: true,
        criado_em: new Date('2026-01-01T12:00:00Z'),
        unidade_cnes: null,
        profissional_nome: null,
      },
    ]);

    const [item] = await listarEncaminhamentos('30');

    expect(item.profissional).toBe('Não identificado');
    expect(item.unidade).toBe('Não informada');
    expect(item.classificacaoRisco).toBe('Amarela');
  });

  it('normaliza classificacao_risco vazia ("") para null em vez de repassar string vazia', async () => {
    buscarEncaminhamentosRecentesMock.mockResolvedValue([
      {
        id: 'e2',
        sessao_id: 's2',
        especialidade: 'dermatologia',
        classificacao_risco: '',
        elegivel: false,
        criado_em: new Date('2026-01-02T12:00:00Z'),
        unidade_cnes: null,
        profissional_nome: '  ',
      },
    ]);

    const [item] = await listarEncaminhamentos('7');

    expect(item.classificacaoRisco).toBeNull();
    expect(item.profissional).toBe('Não identificado');
  });
});

describe('buscarDetalheEncaminhamento', () => {
  beforeEach(() => {
    buscarEncaminhamentoPorIdMock.mockReset();
  });

  it('retorna null quando o id não existe', async () => {
    buscarEncaminhamentoPorIdMock.mockResolvedValue(null);
    expect(await buscarDetalheEncaminhamento('inexistente')).toBeNull();
  });

  it('nunca devolve resumoSisreg vazio: usa um texto fixo de fallback', async () => {
    buscarEncaminhamentoPorIdMock.mockResolvedValue({
      id: 'e3',
      sessao_id: 's3',
      especialidade: 'endocrinologia',
      classificacao_risco: null,
      resumo_sisreg: '',
      elegivel: false,
      criado_em: new Date('2026-01-03T12:00:00Z'),
    });

    const detalhe = await buscarDetalheEncaminhamento('e3');

    expect(detalhe?.resumoSisreg).toBe('Nenhum texto registrado para este encaminhamento.');
  });
});
