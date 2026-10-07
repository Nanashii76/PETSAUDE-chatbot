import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chamarLLMComCascataMock, buscarContextoMock, atualizarSessaoMock, salvarEncaminhamentoMock, registrarEventoMock } = vi.hoisted(() => ({
  chamarLLMComCascataMock: vi.fn(),
  buscarContextoMock: vi.fn(),
  atualizarSessaoMock: vi.fn(),
  salvarEncaminhamentoMock: vi.fn(),
  registrarEventoMock: vi.fn(),
}));

vi.mock('../../services/openrouter.js', () => ({
  chamarLLMComCascata: chamarLLMComCascataMock,
}));

vi.mock('../../services/rag.js', () => ({
  buscarContexto: buscarContextoMock,
}));

vi.mock('../../services/database.js', () => ({
  atualizarSessao: atualizarSessaoMock,
  salvarEncaminhamento: salvarEncaminhamentoMock,
  registrarEvento: registrarEventoMock,
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
    atualizarSessaoMock.mockReset();
    salvarEncaminhamentoMock.mockReset();
    registrarEventoMock.mockReset();

    buscarContextoMock.mockResolvedValue({ contexto: '', fontes: [], camposMinimos: [] });
    atualizarSessaoMock.mockResolvedValue({});
    salvarEncaminhamentoMock.mockResolvedValue({});
    registrarEventoMock.mockResolvedValue({});
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
      camposMinimos: ['Sinais e sintomas', 'Duas medidas de pressão arterial'],
    });

    const resultado = await processarMensagemLLM(sessao, 'paciente com hipertensão mal controlada');

    expect(chamarLLMComCascataMock).toHaveBeenCalledTimes(2);
    expect(atualizarSessaoMock).toHaveBeenCalledWith('s1', 'PENDENTE', {}, [], 'cardiologia');
    expect(buscarContextoMock).toHaveBeenCalledWith('paciente com hipertensão mal controlada', 'cardiologia');
    expect(resultado.agente_atual).toBe('cardiologia');
    expect(resultado.texto_resposta).toBe('Preciso de mais dados.');
    expect(resultado.fontes_rag).toEqual([{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.9 }]);

    // A chamada ao especialista (2ª chamada) manda só a mensagem atual — sem histórico —
    // e o system prompt traz a checklist de campos e o estado já coletado, em vez de prosa solta.
    const [systemPromptEspecialista, mensagensEspecialista] = chamarLLMComCascataMock.mock.calls[1];
    expect(mensagensEspecialista).toEqual([{ role: 'user', content: 'paciente com hipertensão mal controlada' }]);
    expect(systemPromptEspecialista).toContain('[CAMPOS OBRIGATÓRIOS]');
    expect(systemPromptEspecialista).toContain('Sinais e sintomas');
    expect(systemPromptEspecialista).toContain('[ESTADO ATUAL DA COLETA]');
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

  it('sessão existente: não chama o roteador de novo (só 1 chamada ao LLM), e o estado já coletado vai no prompt', async () => {
    const sessao = { id: 's3', agente_atual: 'cardiologia', status: 'PENDENTE', dados_coletados: { idade: 62 }, dados_pendentes: [] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'FINALIZADO',
          texto_resposta: 'Encaminhamento aprovado.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: [],
          cor_risco: 'Amarela',
          urgencia: false,
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'segue mais informação', 'interlocutor-abc');

    expect(chamarLLMComCascataMock).toHaveBeenCalledTimes(1);
    // FINALIZADO do LLM não finaliza na hora: vira um resumo de confirmação (PENDENTE) com botões —
    // ver testes dedicados ao gate de confirmação mais abaixo.
    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.opcoes).toEqual(['Confirmar e gerar texto', 'Preciso corrigir algo']);
    expect(resultado.dados_coletados._aguardando_confirmacao_final).toBe(true);
    expect(resultado.dados_coletados._texto_final_pendente).toBe('Encaminhamento aprovado.');
    expect(resultado.dados_coletados._cor_final_pendente).toBe('Amarela');
    expect(salvarEncaminhamentoMock).not.toHaveBeenCalled();
    expect(registrarEventoMock).not.toHaveBeenCalledWith('texto_gerado', expect.anything(), expect.anything(), expect.anything(), expect.anything());

    const [systemPrompt, mensagens] = chamarLLMComCascataMock.mock.calls[0];
    expect(mensagens).toEqual([{ role: 'user', content: 'segue mais informação' }]);
    expect(systemPrompt).toContain('"idade":62');
  });

  it('sessão nova de verdade (sessao.nova === true): registra evento caso_iniciado com o interlocutor', async () => {
    const sessao = { id: 's-nova', agente_atual: null, status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [], nova: true };

    chamarLLMComCascataMock
      .mockResolvedValueOnce(respostaLLM('{"intencao":"dermatologia"}'))
      .mockResolvedValueOnce(
        respostaLLM(
          JSON.stringify({
            status: 'PENDENTE',
            texto_resposta: 'Descreva a lesão.',
            dados_coletados_ate_o_momento: {},
            dados_pendentes: ['lesão'],
          })
        )
      );

    await processarMensagemLLM(sessao, 'tenho uma mancha na pele', 'interlocutor-xyz');

    expect(registrarEventoMock).toHaveBeenCalledWith('caso_iniciado', 'dermatologia', 's-nova', 'interlocutor-xyz');
  });

  it('sessão existente (sessao.nova ausente): não registra caso_iniciado de novo', async () => {
    const sessao = { id: 's-existente', agente_atual: 'dermatologia', status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'PENDENTE',
          texto_resposta: 'Mais um dado.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: [],
        })
      )
    );

    await processarMensagemLLM(sessao, 'segue', 'interlocutor-xyz');

    expect(registrarEventoMock).not.toHaveBeenCalledWith('caso_iniciado', expect.anything(), expect.anything(), expect.anything());
  });

  it('urgência: prefixa o aviso fixo do código (não o texto do LLM) e marca a sessão pra não repetir', async () => {
    const sessao = { id: 's5', agente_atual: 'cardiologia', status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'PENDENTE',
          texto_resposta: 'Entendido, vou precisar de mais alguns dados.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: ['exames'],
          cor_risco: null,
          urgencia: true,
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'paciente com dor torácica intensa agora', 'interlocutor-urg');

    expect(resultado.texto_resposta).toMatch(/^\*\*Atenção:\*\* o relato sugere um quadro agudo/);
    expect(resultado.texto_resposta).toContain('Entendido, vou precisar de mais alguns dados.');
    expect(resultado.dados_coletados._urgencia_mostrada).toBe(true);
    expect(registrarEventoMock).toHaveBeenCalledWith('urgencia', 'cardiologia', 's5', 'interlocutor-urg');
  });

  it('urgência: não repete o aviso se a sessão já mostrou nesta conversa', async () => {
    const sessao = {
      id: 's6', agente_atual: 'cardiologia', status: 'PENDENTE',
      dados_coletados: { _urgencia_mostrada: true }, dados_pendentes: [],
    };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'PENDENTE',
          texto_resposta: 'Prosseguindo com a coleta.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: [],
          cor_risco: null,
          urgencia: true,
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'segue o relato');

    expect(resultado.texto_resposta).toBe('Prosseguindo com a coleta.');
  });

  it('cor de risco: FINALIZADO sem cor definida pela NT vira PENDENTE e pergunta a cor, sem gerar encaminhamento ainda', async () => {
    const sessao = { id: 's7', agente_atual: 'endocrinologia', status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'FINALIZADO',
          texto_resposta: 'Caso elegível, encaminhamento pronto.',
          dados_coletados_ate_o_momento: { diagnostico: 'nódulo de tireoide' },
          dados_pendentes: [],
          cor_risco: null,
          urgencia: false,
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'segue o caso');

    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.texto_resposta).toMatch(/classificação de risco/i);
    expect(resultado.opcoes).toEqual(['Amarela', 'Verde', 'Azul', 'Vermelha']);
    expect(resultado.dados_coletados._aguardando_cor).toBe(true);
    expect(resultado.dados_coletados._cor_risco_perguntada).toBe(true);
    expect(salvarEncaminhamentoMock).not.toHaveBeenCalled();
  });

  it('cor de risco: resposta à pergunta de cor inclui o contexto [PERGUNTA PENDENTE] e segue pro resumo de confirmação (não finaliza direto)', async () => {
    const sessao = {
      id: 's8', agente_atual: 'endocrinologia', status: 'PENDENTE',
      dados_coletados: { diagnostico: 'nódulo de tireoide', _aguardando_cor: true, _cor_risco_perguntada: true },
      dados_pendentes: ['Classificação de risco (Amarela, Verde ou Azul)'],
    };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'FINALIZADO',
          texto_resposta: 'Encaminhamento pronto com a cor informada.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: [],
          cor_risco: 'Verde',
          urgencia: false,
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'Verde');

    const [systemPrompt] = chamarLLMComCascataMock.mock.calls[0];
    expect(systemPrompt).toContain('[PERGUNTA PENDENTE]');
    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.opcoes).toEqual(['Confirmar e gerar texto', 'Preciso corrigir algo']);
    expect(resultado.dados_coletados._aguardando_cor).toBeUndefined();
    expect(resultado.dados_coletados._aguardando_confirmacao_final).toBe(true);
    expect(resultado.dados_coletados._texto_final_pendente).toBe('Encaminhamento pronto com a cor informada.');
    expect(resultado.dados_coletados._cor_final_pendente).toBe('Verde');
    expect(salvarEncaminhamentoMock).not.toHaveBeenCalled();
  });

  it('cor de risco: não pergunta uma segunda vez na mesma sessão (evita travar o profissional num loop) — segue pro resumo mesmo sem cor', async () => {
    const sessao = {
      id: 's9', agente_atual: 'endocrinologia', status: 'PENDENTE',
      dados_coletados: { _cor_risco_perguntada: true },
      dados_pendentes: [],
    };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'FINALIZADO',
          texto_resposta: 'Encaminhamento pronto.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: [],
          cor_risco: null,
          urgencia: false,
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'segue o caso');

    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.dados_coletados._aguardando_confirmacao_final).toBe(true);
    expect(resultado.dados_coletados._texto_final_pendente).toBe('Encaminhamento pronto.');
    expect(resultado.dados_coletados._cor_final_pendente).toBeNull();
    expect(salvarEncaminhamentoMock).not.toHaveBeenCalled();
  });

  it('confirmação final: "Confirmar e gerar texto" finaliza sem chamar o LLM, usando o texto já gerado', async () => {
    const sessao = {
      id: 's12', agente_atual: 'cardiologia', status: 'PENDENTE',
      dados_coletados: {
        idade: 70, diagnostico: 'Insuficiência cardíaca',
        _aguardando_confirmacao_final: true,
        _texto_final_pendente: 'Texto final já pronto, gerado no turno anterior.',
        _cor_final_pendente: 'Verde',
      },
      dados_pendentes: [],
    };

    const resultado = await processarMensagemLLM(sessao, 'Confirmar e gerar texto', 'interlocutor-conf');

    expect(chamarLLMComCascataMock).not.toHaveBeenCalled();
    expect(resultado.novo_status).toBe('FINALIZADO');
    expect(resultado.texto_resposta).toBe('Texto final já pronto, gerado no turno anterior.');
    expect(resultado.cor_risco).toBe('Verde');
    expect(resultado.dados_coletados._aguardando_confirmacao_final).toBeUndefined();
    expect(resultado.dados_coletados._texto_final_pendente).toBeUndefined();
    expect(resultado.dados_coletados.diagnostico).toBe('Insuficiência cardíaca'); // dados normais preservados
    expect(salvarEncaminhamentoMock).toHaveBeenCalledWith(
      's12', 'cardiologia', 'Verde', 'Texto final já pronto, gerado no turno anterior.', expect.any(Object), true
    );
    expect(registrarEventoMock).toHaveBeenCalledWith(
      'texto_gerado', 'cardiologia', 's12', 'interlocutor-conf', { cor_risco: 'Verde' }
    );
  });

  it('confirmação final: "Preciso corrigir algo" volta pra coleta sem chamar o LLM, sem gravar nada', async () => {
    const sessao = {
      id: 's13', agente_atual: 'cardiologia', status: 'PENDENTE',
      dados_coletados: {
        diagnostico: 'Insuficiência cardíaca',
        _aguardando_confirmacao_final: true,
        _texto_final_pendente: 'Texto que não deveria ser usado.',
        _cor_final_pendente: 'Verde',
      },
      dados_pendentes: [],
    };

    const resultado = await processarMensagemLLM(sessao, 'Preciso corrigir algo');

    expect(chamarLLMComCascataMock).not.toHaveBeenCalled();
    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.texto_resposta).toMatch(/corrigir ou adicionar/i);
    expect(resultado.dados_coletados._aguardando_confirmacao_final).toBeUndefined();
    expect(resultado.dados_coletados._texto_final_pendente).toBeUndefined();
    expect(resultado.dados_coletados._cor_final_pendente).toBeUndefined();
    expect(resultado.dados_coletados.diagnostico).toBe('Insuficiência cardíaca');
    expect(salvarEncaminhamentoMock).not.toHaveBeenCalled();
    expect(registrarEventoMock).not.toHaveBeenCalled();
  });

  it('NAO_ELEGIVEL também grava em encaminhamentos, com elegivel=false', async () => {
    const sessao = { id: 's10', agente_atual: 'dermatologia', status: 'PENDENTE', dados_coletados: {}, dados_pendentes: [] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM(
        JSON.stringify({
          status: 'NAO_ELEGIVEL',
          texto_resposta: 'Não atende critério, manejar na APS.',
          dados_coletados_ate_o_momento: {},
          dados_pendentes: [],
          cor_risco: null,
          urgencia: false,
        })
      )
    );

    const resultado = await processarMensagemLLM(sessao, 'segue o caso', 'interlocutor-ne');

    expect(resultado.novo_status).toBe('NAO_ELEGIVEL');
    expect(salvarEncaminhamentoMock).toHaveBeenCalledWith(
      's10', 'dermatologia', null, 'Não atende critério, manejar na APS.', expect.any(Object), false
    );
    expect(registrarEventoMock).toHaveBeenCalledWith(
      'nao_elegivel', 'dermatologia', 's10', 'interlocutor-ne', { cor_risco: null }
    );
  });

  it('regressão: especialista retorna JSON tecnicamente válido mas vazio/degenerado ({"": ""}) — cai no mesmo fallback de erro', async () => {
    const sessao = { id: 's11', agente_atual: 'cardiologia', status: 'PENDENTE', dados_coletados: { idade: 62 }, dados_pendentes: ['exames'] };

    chamarLLMComCascataMock.mockResolvedValueOnce(respostaLLM('{"": ""}'));
    buscarContextoMock.mockResolvedValue({
      contexto: 'trecho',
      fontes: [{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.7 }],
      camposMinimos: [],
    });

    const resultado = await processarMensagemLLM(sessao, 'segue mais informação');

    expect(resultado.texto_resposta).toBe('Houve uma falha na estruturação clínica. Poderia repetir a última informação, por favor?');
    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.dados_coletados).toEqual({ idade: 62 });
    expect(salvarEncaminhamentoMock).not.toHaveBeenCalled();
  });

  it('regressão: especialista retorna texto solto (não-JSON) — cai no fallback de erro, mantendo as fontes do RAG', async () => {
    const sessao = { id: 's4', agente_atual: 'cardiologia', status: 'PENDENTE', dados_coletados: { idade: 62 }, dados_pendentes: ['exames'] };

    chamarLLMComCascataMock.mockResolvedValueOnce(
      respostaLLM('Prezado(a) profissional de saúde,\n\nCom base nas informações...', {
        tokens_prompt: 850,
        tokens_resposta: 2048,
      })
    );
    buscarContextoMock.mockResolvedValue({
      contexto: 'trecho',
      fontes: [{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.7 }],
      camposMinimos: [],
    });

    const resultado = await processarMensagemLLM(sessao, 'segue mais informação');

    expect(resultado.texto_resposta).toBe('Houve uma falha na estruturação clínica. Poderia repetir a última informação, por favor?');
    expect(resultado.novo_status).toBe('PENDENTE');
    expect(resultado.dados_coletados).toEqual({ idade: 62 });
    expect(resultado.fontes_rag).toEqual([{ titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.7 }]);
    // O consumo real de tokens já veio na resposta do OpenRouter mesmo com o JSON quebrado —
    // zerar aqui esconderia da telemetria uma chamada que já foi paga (ex: modelo de raciocínio
    // que estourou o max_tokens "pensando" e nunca chegou a emitir o JSON).
    expect(resultado.telemetria.tokens_prompt).toBe(850);
    expect(resultado.telemetria.tokens_resposta).toBe(2048);
  });
});
