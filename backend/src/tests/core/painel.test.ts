import { describe, it, expect, vi } from 'vitest';

const { porCnesMock } = vi.hoisted(() => ({ porCnesMock: vi.fn() }));

vi.mock('../../core/unidades.js', () => ({
  porCnes: porCnesMock,
}));

const { agregar } = await import('../../core/painel.js');

function linha(overrides: Partial<Parameters<typeof agregar>[0][number]> = {}) {
  return {
    tipo: 'caso_iniciado',
    especialidade: 'cardiologia',
    dados: {},
    unidade_cnes: null,
    criado_em: new Date(),
    ...overrides,
  };
}

describe('painel: agregar', () => {
  it('conta casos, textos, não elegíveis e urgências', () => {
    const p = agregar(
      [
        linha({ tipo: 'caso_iniciado' }),
        linha({ tipo: 'caso_iniciado', especialidade: 'dermatologia' }),
        linha({ tipo: 'texto_gerado', dados: { cor_risco: 'Verde' } }),
        linha({ tipo: 'nao_elegivel', especialidade: 'dermatologia' }),
        linha({ tipo: 'urgencia', especialidade: null }),
      ],
      '30'
    );

    expect(p.casos).toBe(2);
    expect(p.textos).toBe(1);
    expect(p.naoElegiveis).toBe(1);
    expect(p.urgencias).toBe(1);
    expect(p.periodo).toBe('30');
  });

  it('agrega cores de risco globalmente e por especialidade', () => {
    const p = agregar(
      [
        linha({ tipo: 'texto_gerado', especialidade: 'cardiologia', dados: { cor_risco: 'Verde' } }),
        linha({ tipo: 'texto_gerado', especialidade: 'cardiologia', dados: { cor_risco: 'Verde' } }),
        linha({ tipo: 'texto_gerado', especialidade: 'endocrinologia', dados: { cor_risco: 'Amarela' } }),
        linha({ tipo: 'texto_gerado', especialidade: 'endocrinologia', dados: {} }), // sem cor, não conta
      ],
      'tudo'
    );

    expect(p.cores).toEqual({ Verde: 2, Amarela: 1 });
    const cardio = p.especialidades.find((e) => e.especialidade === 'cardiologia')!;
    const endo = p.especialidades.find((e) => e.especialidade === 'endocrinologia')!;
    expect(cardio.cores).toEqual({ Verde: 2 });
    expect(endo.cores).toEqual({ Amarela: 1 });
    expect(endo.textos).toBe(2);
  });

  it('ignora cor_risco vazia/null/"null" (achado em produção: a string literal "null" não pode virar uma cor no gráfico)', () => {
    const p = agregar(
      [
        linha({ tipo: 'texto_gerado', especialidade: 'cardiologia', dados: { cor_risco: 'Amarela' } }),
        linha({ tipo: 'texto_gerado', especialidade: 'cardiologia', dados: { cor_risco: 'null' } }),
        linha({ tipo: 'texto_gerado', especialidade: 'cardiologia', dados: { cor_risco: null } }),
        linha({ tipo: 'texto_gerado', especialidade: 'cardiologia', dados: { cor_risco: '' } }),
      ],
      'tudo'
    );

    expect(p.cores).toEqual({ Amarela: 1 });
  });

  it('agrupa por especialidade e ordena por número de casos (maior primeiro)', () => {
    const p = agregar(
      [
        linha({ tipo: 'caso_iniciado', especialidade: 'dermatologia' }),
        linha({ tipo: 'caso_iniciado', especialidade: 'cardiologia' }),
        linha({ tipo: 'caso_iniciado', especialidade: 'cardiologia' }),
      ],
      'tudo'
    );

    expect(p.especialidades.map((e) => e.especialidade)).toEqual(['cardiologia', 'dermatologia']);
    expect(p.especialidades[0].casos).toBe(2);
  });

  it('recorte por unidade/região usa unidades.ts para nome e região, e ignora eventos sem unidade', () => {
    porCnesMock.mockImplementation((cnes: string) =>
      cnes === '10731' ? { cnes, nome: 'UBS 1 Cruzeiro', ra: 'Cruzeiro', regiao: 'Central', rotulo: 'UBS 1 Cruzeiro' } : undefined
    );

    const p = agregar(
      [
        linha({ tipo: 'caso_iniciado', unidade_cnes: '10731' }),
        linha({ tipo: 'caso_iniciado', unidade_cnes: '10731' }),
        linha({ tipo: 'caso_iniciado', unidade_cnes: null }), // sem unidade informada — não entra no recorte
      ],
      'tudo'
    );

    expect(p.unidades).toEqual([{ nome: 'UBS 1 Cruzeiro', regiao: 'Central', casos: 2 }]);
    expect(p.regioes).toEqual([{ nome: 'Central', regiao: 'Central', casos: 2 }]);
  });

  it('eventos de urgência não entram no recorte por unidade/região (não representam um caso fechado)', () => {
    porCnesMock.mockReturnValue({ cnes: '10731', nome: 'UBS 1 Cruzeiro', ra: 'Cruzeiro', regiao: 'Central', rotulo: 'x' });

    const p = agregar([linha({ tipo: 'urgencia', especialidade: 'cardiologia', unidade_cnes: '10731' })], 'tudo');

    expect(p.unidades).toEqual([]);
    expect(p.regioes).toEqual([]);
  });

  it('unidade sem correspondência em unidades.ts cai de volta no próprio CNES como nome, sem quebrar', () => {
    porCnesMock.mockReturnValue(undefined);

    const p = agregar([linha({ tipo: 'caso_iniciado', unidade_cnes: '99999' })], 'tudo');

    expect(p.unidades).toEqual([{ nome: '99999', regiao: null, casos: 1 }]);
    expect(p.regioes).toEqual([{ nome: 'Não informada', regiao: 'Não informada', casos: 1 }]);
  });

  it('lista vazia produz um painel zerado, sem lançar erro', () => {
    const p = agregar([], '7');

    expect(p).toMatchObject({ periodo: '7', casos: 0, textos: 0, naoElegiveis: 0, urgencias: 0, cores: {} });
    expect(p.especialidades).toEqual([]);
    expect(p.unidades).toEqual([]);
    expect(p.regioes).toEqual([]);
  });
});
