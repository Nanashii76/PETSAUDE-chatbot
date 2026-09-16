import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chamarLLMComCascataMock, buscarContextoMock, buscarHistoricoSessaoMock, atualizarSessaoMock } = vi.hoisted(() => ({
  chamarLLMComCascataMock: vi.fn(),
  buscarContextoMock: vi.fn(),
  buscarHistoricoSessaoMock: vi.fn(),
  atualizarSessaoMock: vi.fn(),
}));

vi.mock('../../services/openrouter.js', () => ({
  chamarLLMComCascata: chamarLLMComCascataMock,
}));

vi.mock('../../services/rag.js', () => ({
  buscarContexto: buscarContextoMock,
}));

vi.mock('../../services/database.js', () => ({
  buscarHistoricoSessao: buscarHistoricoSessaoMock,
  atualizarSessao: atualizarSessaoMock,
}));

const { processarMensagemLLM } = await import('../../core/orchestrator.js');

function respostaLLM(conteudo: string, extras: Partial<{ modelo_usado: string; tokens_prompt: number; tokens_resposta: number }> = {}) {
  return {
    conteudo,
    modelo_usado: extras.modelo_usado ?? 'modelo-teste',
    tokens_prompt: extras.tokens_prompt ?? 10,
    tokens_resposta: extras.tokens_resposta ?? 10,
  };
}

describe('processarMensagemLLM', () => {
  beforeEach(() => {
    chamarLLMComCascataMock.mockReset();
    buscarContextoMock.mockReset();
    buscarHistoricoSessaoMock.mockReset();
    atualizarSessaoMock.mockReset();

    buscarHistoricoSessaoMock.mockResolvedValue([]);
    buscarContextoMock.mockResolvedValue({ contexto: '', fontes: [] });
    atualizarSessaoMock.mockResolvedValue({});
  });

  it('sessão nova: chama o roteador, classifica a especialidade e persiste o novo agente', async () => {
    const sessao = { id: 's1', agente_atual: null, status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [] };

    chamarLLMComCascataMock
      .mockResolvedValueOnce(respostaLLM('{"intencao":"cardiologia"}'))
      .mockResolvedValueOnce(
        respostaLLM(
          JSON.stringify({
            status: 'PENDENTE',
            texto_resposta: 'Preciso de mais dados.',
            dados_coletados_ate_o_momento: { idade: 62 },
            dados_pendentes: ['sinais e sintomas'],
          })
        )
      );
    buscarContextoMock.mockResolvedValue({
      contexto: 'trecho relevante',
      fontes: [{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.9 }],
    });

    const resultado = await processarMensagemLLM(sessao, 'paciente com hipertensão mal controlada');

    expect(chamarLLMComCascataMock).toHaveBeenCalledTimes(2);
    expect(atualizarSessaoMock).toHaveBeenCalledWith('s1', 'PENDENTE', {}, [], 'cardiologia');
    expect(buscarContextoMock).toHaveBeenCalledWith('paciente com hipertensão mal controlada', 'cardiologia');
    expect(resultado.agente_atual).toBe('cardiologia');
    expect(resultado.texto_resposta).toBe('Preciso de mais dados.');
    expect(resultado.fontes_rag).toEqual([{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.9 }]);
  });

  it('roteador retorna JSON inválido: cai para duvidas_gerais sem persistir sessão', async () => {
    const sessao = { id: 's2', agente_atual: null, status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [] };

    chamarLLMComCascataMock
      .mockResolvedValueOnce(respostaLLM('não sou um json válido'))
      .mockResolvedValueOnce(
        respostaLLM(
          JSON.stringify({
            status: 'PENDENTE',
            texto_resposta: 'Olá! Como posso ajudar?',
            dados_coletados_ate_o_momento: {},
            dados_pendentes: [],
          })
        )
      );

    const resultado = await processarMensagemLLM(sessao, 'oi');

    expect(resultado.agente_atual).toBe('duvidas_gerais');
    expect(atualizarSessaoMock).not.toHaveBeenCalled();
  });

  it('sessão existente: não chama o roteador de novo (só 1 chamada ao LLM)', async () => {
    const sessao = { id: 's3', agente_atual: 'cardiologia', status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'FINALIZADO',
          texto_resposta: 'Encaminhamento aprovado.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: [],
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'segue mais informação');

    expect(chamarLLMComCascataMock).toHaveBeenCalledTimes(1);
    expect(resultado.novo_status).toBe('FINALIZADO');
  });

  it('regressão: especialista retorna texto solto (não-JSON) — cai no fallback de erro, mantendo as fontes do RAG', async () => {
    const sessao = { id: 's4', agente_atual: 'cardiologia', status: 'PENDENTE', dados_coletados: { idade: 62 }, dados_pendentes: ['exames'] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM('Prezado(a) profissional de saúde,\n\nCom base nas informações...')
    );
    buscarContextoMock.mockResolvedValue({
      contexto: 'trecho',
      fontes: [{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.7 }],
    });

    const resultado = await processarMensagemLLM(sessao, 'segue mais informação');

    expect(resultado.texto_resposta).toBe('Houve uma falha na estruturação clínica. Poderia repetir a última informação, por favor?');
    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.dados_coletados).toEqual({ idade: 62 });
    expect(resultado.fontes_rag).toEqual([{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.7 }]);
    expect(resultado.telemetria.tokens_prompt).toBe(0);
    expect(resultado.telemetria.tokens_resposta).toBe(0);
  });
});
