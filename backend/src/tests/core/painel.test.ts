import { describe, it, expect, vi } from 'vitest';

const { porCnesMock } = vi.hoisted(() => ({ porCnesMock: vi.fn() }));

vi.mock('../../core/unidades.js', () => ({
  porCnes: porCnesMock,
}));

vi.mock('../../services/openrouter.js', () => ({
  FALLBACK_CASCADE: ['modelo-principal', 'modelo-reserva'],
}));

const { agregar } = await import('../../core/painel.js');

function linha(overrides: Partial<Parameters<typeof agregar>[0][number]> = {}) {
  return {
    tipo: 'caso_iniciado',
    especialidade: 'cardiologia',
    sessao_id: null as string | null,
    dados: {} as Record<string, any>,
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

  describe('série temporal', () => {
    // 15h em Brasília (18h UTC) — longe da virada do dia nos dois fusos.
    const agora = new Date('2026-11-05T18:00:00Z');

    it('período fixo: um ponto por dia da janela, com zero nos dias sem evento', () => {
      const p = agregar(
        [
          linha({ tipo: 'caso_iniciado', criado_em: new Date('2026-11-03T13:00:00Z') }),
          linha({ tipo: 'caso_iniciado', criado_em: new Date('2026-11-05T13:00:00Z') }),
          linha({ tipo: 'texto_gerado', criado_em: new Date('2026-11-05T14:00:00Z') }),
          linha({ tipo: 'nao_elegivel', criado_em: new Date('2026-11-05T15:00:00Z') }),
        ],
        '7',
        { agora }
      );

      expect(p.serie.map((d) => d.dia)).toEqual([
        '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
      ]);
      expect(p.serie[4]).toEqual({ dia: '2026-11-03', casos: 1, textos: 0, naoElegiveis: 0 });
      expect(p.serie[5]).toEqual({ dia: '2026-11-04', casos: 0, textos: 0, naoElegiveis: 0 });
      expect(p.serie[6]).toEqual({ dia: '2026-11-05', casos: 1, textos: 1, naoElegiveis: 1 });
    });

    it('agrupa pelo dia de Brasília, não pelo dia UTC', () => {
      // 01h UTC do dia 05 = 22h do dia 04 em Brasília.
      const p = agregar([linha({ criado_em: new Date('2026-11-05T01:00:00Z') })], 'tudo', { agora });

      expect(p.serie[0]).toEqual({ dia: '2026-11-04', casos: 1, textos: 0, naoElegiveis: 0 });
    });

    it('"tudo" começa no primeiro evento; sem eventos, a série é vazia', () => {
      const p = agregar([linha({ criado_em: new Date('2026-11-04T12:00:00Z') })], 'tudo', { agora });
      expect(p.serie.map((d) => d.dia)).toEqual(['2026-11-04', '2026-11-05']);

      expect(agregar([], 'tudo', { agora }).serie).toEqual([]);
    });
  });

  describe('uso de modelo', () => {
    it('soma tokens, separa respostas locais e conta quedas da cascata', () => {
      const p = agregar(
        [linha({ tipo: 'texto_gerado' }), linha({ tipo: 'texto_gerado' })],
        'tudo',
        {
          telemetria: [
            { modelo_usado: 'modelo-principal', respostas: 6, tokens_prompt: 600, tokens_resposta: 60, com_fontes_rag: 4 },
            { modelo_usado: 'modelo-reserva', respostas: 2, tokens_prompt: 200, tokens_resposta: 20, com_fontes_rag: 1 },
            { modelo_usado: 'nenhum (confirmação local)', respostas: 2, tokens_prompt: 0, tokens_resposta: 0, com_fontes_rag: 0 },
          ],
        }
      );

      expect(p.uso).toMatchObject({
        respostasLLM: 8,
        respostasFallback: 2,
        tokensPrompt: 800,
        tokensResposta: 80,
        tokensPorEncaminhamento: 440,
      });
      expect(p.uso.modelos.map((m) => m.modelo)).toEqual(['modelo-principal', 'modelo-reserva']);
      expect(p.qualidade.ragComNota).toBe(5);
    });

    it('sem encaminhamento gerado, tokens por encaminhamento é null (não divide por zero)', () => {
      const p = agregar([], 'tudo', {
        telemetria: [{ modelo_usado: 'modelo-principal', respostas: 1, tokens_prompt: 10, tokens_resposta: 1, com_fontes_rag: 0 }],
      });

      expect(p.uso.tokensPorEncaminhamento).toBeNull();
    });
  });

  describe('fluxo dos casos', () => {
    const agora = new Date('2026-11-05T18:00:00Z');
    const t = (iso: string) => new Date(iso);

    it('tempo médio e turnos médios só contam casos que terminaram em texto gerado', () => {
      const p = agregar(
        [
          linha({ tipo: 'caso_iniciado', sessao_id: 'a', criado_em: t('2026-11-05T10:00:00Z') }),
          linha({ tipo: 'texto_gerado', sessao_id: 'a', criado_em: t('2026-11-05T10:10:00Z') }),
          linha({ tipo: 'caso_iniciado', sessao_id: 'b', criado_em: t('2026-11-05T11:00:00Z') }),
          linha({ tipo: 'texto_gerado', sessao_id: 'b', criado_em: t('2026-11-05T11:20:00Z') }),
          linha({ tipo: 'caso_iniciado', sessao_id: 'c', criado_em: t('2026-11-05T12:00:00Z') }),
          linha({ tipo: 'nao_elegivel', sessao_id: 'c', criado_em: t('2026-11-05T12:01:00Z') }),
        ],
        'tudo',
        {
          agora,
          sessoes: [
            { sessao_id: 'a', status: 'FINALIZADO', atualizado_em: agora, turnos: 3 },
            { sessao_id: 'b', status: 'FINALIZADO', atualizado_em: agora, turnos: 6 },
            { sessao_id: 'c', status: 'NAO_ELEGIVEL', atualizado_em: agora, turnos: 1 },
          ],
        }
      );

      expect(p.fluxo.minutosMedioAteFinalizar).toBe(15);
      expect(p.fluxo.turnosMedioPorCaso).toBe(4.5);
      expect(p.fluxo.emAndamento).toBe(0);
      expect(p.fluxo.abandonados).toBe(0);
    });

    it('separa casos em andamento de abandonados (status ABANDONADA ou PENDENTE parado há mais de 24h)', () => {
      const p = agregar(
        [
          linha({ tipo: 'caso_iniciado', sessao_id: 'ativo' }),
          linha({ tipo: 'caso_iniciado', sessao_id: 'parado' }),
          linha({ tipo: 'caso_iniciado', sessao_id: 'desistiu' }),
        ],
        'tudo',
        {
          agora,
          sessoes: [
            { sessao_id: 'ativo', status: 'PENDENTE', atualizado_em: t('2026-11-05T17:00:00Z'), turnos: 2 },
            { sessao_id: 'parado', status: 'PENDENTE', atualizado_em: t('2026-11-03T17:00:00Z'), turnos: 2 },
            { sessao_id: 'desistiu', status: 'ABANDONADA', atualizado_em: agora, turnos: 1 },
          ],
        }
      );

      expect(p.fluxo.emAndamento).toBe(1);
      expect(p.fluxo.abandonados).toBe(2);
      expect(p.fluxo.minutosMedioAteFinalizar).toBeNull();
    });
  });

  describe('qualidade e regulação', () => {
    it('conta origem da cor (eventos antigos sem origem_cor não entram) e RAG vazio', () => {
      const p = agregar(
        [
          linha({ tipo: 'texto_gerado', dados: { cor_risco: 'Verde', origem_cor: 'rag' } }),
          linha({ tipo: 'texto_gerado', dados: { cor_risco: 'Azul', origem_cor: 'manual' } }),
          linha({ tipo: 'texto_gerado', dados: { cor_risco: 'Verde' } }),
          linha({ tipo: 'rag_vazio' }),
        ],
        'tudo'
      );

      expect(p.qualidade.coresPorOrigem).toEqual({ rag: 1, manual: 1 });
      expect(p.qualidade.ragVazio).toBe(1);
    });

    it('eventos da aba de regulação: contagens, veredito e ranking de campos faltantes', () => {
      const p = agregar(
        [
          linha({ tipo: 'pedido_analisado', dados: { campos_faltantes: ['PA', 'ECG'], parece_atender_criterio: null } }),
          linha({ tipo: 'pedido_analisado', dados: { campos_faltantes: ['ECG'], parece_atender_criterio: true } }),
          linha({ tipo: 'pedido_analisado', dados: { campos_faltantes: [], parece_atender_criterio: false } }),
          linha({ tipo: 'devolucao_redigida' }),
          linha({ tipo: 'consulta_criterio' }),
        ],
        'tudo'
      );

      expect(p.regulacao).toEqual({
        pedidosAnalisados: 3,
        devolucoes: 1,
        consultas: 1,
        pareceAtender: { sim: 1, nao: 1, indefinido: 1 },
        camposFaltantes: [
          { campo: 'ECG', vezes: 2 },
          { campo: 'PA', vezes: 1 },
        ],
      });
      // Eventos de regulação não são casos de encaminhamento da APS.
      expect(p.casos).toBe(0);
      expect(p.especialidades).toEqual([]);
    });
  });
});
