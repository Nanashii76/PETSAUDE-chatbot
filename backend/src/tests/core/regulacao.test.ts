import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chamarLLMComCascataMock, buscarContextoMock } = vi.hoisted(() => ({
  chamarLLMComCascataMock: vi.fn(),
  buscarContextoMock: vi.fn(),
}));

vi.mock('../../services/openrouter.js', () => ({
  chamarLLMComCascata: chamarLLMComCascataMock,
}));

vi.mock('../../services/rag.js', () => ({
  buscarContexto: buscarContextoMock,
}));

const { processarMensagemRegulacao } = await import('../../core/regulacao.js');

function respostaLLM(conteudo: string) {
  return { conteudo, modelo_usado: 'modelo-teste', tokens_prompt: 10, tokens_resposta: 10 };
}

describe('processarMensagemRegulacao', () => {
  beforeEach(() => {
    chamarLLMComCascataMock.mockReset();
    buscarContextoMock.mockReset();
    buscarContextoMock.mockResolvedValue({ contexto: '', fontes: [], camposMinimos: [] });
  });

  it('"Novo pedido" reseta o estado sem chamar o LLM', async () => {
    const sessao = { id: 's1', dados_coletados: { _ultima_analise: { especialidade: 'cardiologia', campos_faltantes: ['x'] } } };

    const resultado = await processarMensagemRegulacao(sessao, 'Novo pedido');

    expect(chamarLLMComCascataMock).not.toHaveBeenCalled();
    expect(resultado.dados_coletados).toEqual({});
    expect(resultado.opcoes).toEqual([]);
    expect(resultado.texto_resposta).toMatch(/Modo Regulação/);
  });

  it('mensagem "outro" (saudação) usa a resposta do identificador, sem RAG nem 2ª chamada', async () => {
    const sessao = { id: 's2', dados_coletados: {} };
    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(JSON.stringify({ tipo: 'outro', especialidade: 'indefinida', resposta: 'Eu analiso pedidos e respondo consultas sobre as NTs.' }))
    );

    const resultado = await processarMensagemRegulacao(sessao, 'oi, bom dia');

    expect(chamarLLMComCascataMock).toHaveBeenCalledTimes(1);
    expect(buscarContextoMock).not.toHaveBeenCalled();
    expect(resultado.texto_resposta).toBe('Eu analiso pedidos e respondo consultas sobre as NTs.');
    expect(resultado.opcoes).toEqual([]);
  });

  it('especialidade "indefinida" também cai no fallback do identificador, mesmo com tipo pedido/consulta', async () => {
    const sessao = { id: 's2b', dados_coletados: {} };
    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(JSON.stringify({ tipo: 'consulta', especialidade: 'indefinida', resposta: 'Qual especialidade?' }))
    );

    const resultado = await processarMensagemRegulacao(sessao, 'quais os critérios?');

    expect(buscarContextoMock).not.toHaveBeenCalled();
    expect(resultado.texto_resposta).toBe('Qual especialidade?');
  });

  it('"consulta" monta a resposta só com o que o RAG trouxe, sem 2ª chamada ao LLM', async () => {
    const sessao = { id: 's3', dados_coletados: {} };
    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(JSON.stringify({ tipo: 'consulta', especialidade: 'cardiologia', resposta: '' }))
    );
    buscarContextoMock.mockResolvedValue({
      contexto: 'Critério X da NT 04/2018.',
      fontes: [{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.9 }],
      camposMinimos: ['Sinais e sintomas', 'Duas medidas de pressão arterial'],
    });

    const resultado = await processarMensagemRegulacao(sessao, 'quais os critérios para hipertensão?');

    expect(chamarLLMComCascataMock).toHaveBeenCalledTimes(1);
    expect(buscarContextoMock).toHaveBeenCalledWith('quais os critérios para hipertensão?', 'cardiologia');
    expect(resultado.texto_resposta).toContain('Critério X da NT 04/2018.');
    expect(resultado.texto_resposta).toContain('Sinais e sintomas');
    expect(resultado.opcoes).toEqual(['Novo pedido']);
  });

  it('"pedido" completo (sem campos faltantes): relatório sem seção de faltantes, só "Novo pedido" como opção', async () => {
    const sessao = { id: 's4', dados_coletados: {} };
    chamarLLMComCascataMock
      .mockResolvedValueOnce(respostaLLM(JSON.stringify({ tipo: 'pedido', especialidade: 'cardiologia', resposta: '' })))
      .mockResolvedValueOnce(
        respostaLLM(
          JSON.stringify({
            campos_presentes: { 'Sinais e sintomas': 'dor torácica típica há 3 meses' },
            campos_faltantes: [],
            parece_atender_criterio: true,
            observacoes: 'Angina típica com fatores de risco.',
          })
        )
      );
    buscarContextoMock.mockResolvedValue({
      contexto: 'trecho da NT',
      fontes: [],
      camposMinimos: ['Sinais e sintomas'],
    });

    const resultado = await processarMensagemRegulacao(sessao, 'Paciente com dor torácica típica...');

    expect(chamarLLMComCascataMock).toHaveBeenCalledTimes(2);
    expect(resultado.texto_resposta).toContain('Conteúdo mínimo presente no pedido');
    expect(resultado.texto_resposta).not.toContain('Conteúdo mínimo que falta');
    expect(resultado.texto_resposta).toContain('parece atender a um critério');
    expect(resultado.opcoes).toEqual(['Novo pedido']);
    expect(resultado.dados_coletados._ultima_analise).toEqual({ especialidade: 'cardiologia', campos_faltantes: [] });

    // A 2ª chamada (análise) manda o pedido original marcado, mais o contexto da NT no system prompt.
    const [systemAnalise, mensagensAnalise] = chamarLLMComCascataMock.mock.calls[1];
    expect(mensagensAnalise).toEqual([{ role: 'user', content: '[Pedido de encaminhamento recebido]\nPaciente com dor torácica típica...' }]);
    expect(systemAnalise).toContain('[CONTEXTO CLÍNICO OFICIAL]');
    expect(systemAnalise).toContain('[CAMPOS OBRIGATÓRIOS]');
  });

  it('"pedido" incompleto: lista campos faltantes, oferece "Redigir devolução" e guarda a análise', async () => {
    const sessao = { id: 's5', dados_coletados: {} };
    chamarLLMComCascataMock
      .mockResolvedValueOnce(respostaLLM(JSON.stringify({ tipo: 'pedido', especialidade: 'dermatologia', resposta: '' })))
      .mockResolvedValueOnce(
        respostaLLM(
          JSON.stringify({
            campos_presentes: {},
            campos_faltantes: ['Localização da lesão', 'Tempo de evolução'],
            parece_atender_criterio: null,
            observacoes: 'Faltam dados para confirmar.',
          })
        )
      );

    const resultado = await processarMensagemRegulacao(sessao, 'Tem uma lesão suspeita de câncer.');

    expect(resultado.texto_resposta).toContain('Conteúdo mínimo que falta no pedido');
    expect(resultado.texto_resposta).toContain('Localização da lesão');
    expect(resultado.opcoes).toEqual(['Redigir devolução', 'Novo pedido']);
    expect(resultado.dados_coletados._ultima_analise).toEqual({
      especialidade: 'dermatologia',
      campos_faltantes: ['Localização da lesão', 'Tempo de evolução'],
    });
  });

  it('"Redigir devolução" usa a última análise guardada, sem chamar o LLM', async () => {
    const sessao = {
      id: 's6',
      dados_coletados: { _ultima_analise: { especialidade: 'dermatologia', campos_faltantes: ['Localização da lesão'] } },
    };

    const resultado = await processarMensagemRegulacao(sessao, 'Redigir devolução');

    expect(chamarLLMComCascataMock).not.toHaveBeenCalled();
    expect(resultado.copiavel).toContain('Devolução do encaminhamento — Dermatologia');
    expect(resultado.copiavel).toContain('Localização da lesão');
    expect(resultado.opcoes).toEqual(['Novo pedido']);
  });

  it('regressão: identificador retorna JSON inválido — fallback de erro, sem RAG', async () => {
    const sessao = { id: 's7', dados_coletados: {} };
    chamarLLMComCascataMock.mockResolvedValueOnce(respostaLLM('não sou um json válido'));

    const resultado = await processarMensagemRegulacao(sessao, 'texto qualquer');

    expect(buscarContextoMock).not.toHaveBeenCalled();
    expect(resultado.texto_resposta).toMatch(/Não consegui identificar/);
    expect(resultado.opcoes).toEqual([]);
  });

  it('regressão: análise do pedido retorna JSON inválido — fallback de erro', async () => {
    const sessao = { id: 's8', dados_coletados: {} };
    chamarLLMComCascataMock
      .mockResolvedValueOnce(respostaLLM(JSON.stringify({ tipo: 'pedido', especialidade: 'endocrinologia', resposta: '' })))
      .mockResolvedValueOnce(respostaLLM('{ json invalido '));

    const resultado = await processarMensagemRegulacao(sessao, 'Paciente com nódulo de tireoide...');

    expect(resultado.texto_resposta).toMatch(/falha ao estruturar a análise/i);
    expect(resultado.opcoes).toEqual([]);
  });
});
