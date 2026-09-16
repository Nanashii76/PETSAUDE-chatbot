import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chamarLLMComCascata } from '../../services/openrouter.js';

function respostaOk(modelo: string, conteudo: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: conteudo }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };
}

function respostaFalha(status: number) {
  return { ok: false, status };
}

describe('chamarLLMComCascata', () => {
  const envOriginal = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'chave-de-teste';
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = envOriginal;
    vi.restoreAllMocks();
  });

  it('retorna direto quando o 1º modelo responde com sucesso, sem tentar os demais', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk('modelo-1', '{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await chamarLLMComCascata('system prompt', [{ role: 'user', content: 'oi' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.conteudo).toBe('{"ok":true}');
  });

  it('cascateia para o próximo modelo quando o 1º falha (ex: 404 de modelo descontinuado)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respostaFalha(404))
      .mockResolvedValueOnce(respostaOk('modelo-2', '{"status":"PENDENTE"}'));
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await chamarLLMComCascata('system prompt', []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado.modelo_usado).not.toBe('');
    expect(resultado.conteudo).toBe('{"status":"PENDENTE"}');
  });

  it('cascateia para o próximo modelo quando o fetch lança uma exceção de rede', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(respostaOk('modelo-2', '{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await chamarLLMComCascata('system prompt', []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado.conteudo).toBe('{"ok":true}');
  });

  it('regressão: lança erro quando todos os modelos da cascata falham', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaFalha(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chamarLLMComCascata('system prompt', [])).rejects.toThrow(
      'Todos os modelos da cascata falharam'
    );
  });

  it('sempre pede response_format: json_object no corpo da requisição', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk('modelo-1', '{}'));
    vi.stubGlobal('fetch', fetchMock);

    await chamarLLMComCascata('system prompt', []);

    const [, opcoes] = fetchMock.mock.calls[0];
    const corpo = JSON.parse((opcoes as RequestInit).body as string);
    expect(corpo.response_format).toEqual({ type: 'json_object' });
  });

  it('lança erro sem chamar fetch quando OPENROUTER_API_KEY não está configurada', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(chamarLLMComCascata('system prompt', [])).rejects.toThrow(
      'OPENROUTER_API_KEY não está configurada'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
