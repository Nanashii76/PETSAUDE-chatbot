import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcreverAudio } from '../../services/audio.js';

describe('Serviço de Áudio - transcreverAudio', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('lança erro se o buffer de áudio for vazio', async () => {
    await expect(
      transcreverAudio({
        buffer: Buffer.from([]),
        mimeType: 'audio/webm',
      })
    ).rejects.toThrow('Áudio vazio ou inválido.');
  });

  it('lança erro se nenhuma chave de API estiver configurada', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(
      transcreverAudio({
        buffer: Buffer.from('fake-audio-bytes'),
        mimeType: 'audio/webm',
      })
    ).rejects.toThrow('Serviço de transcrição indisponível (chaves não configuradas).');
  });

  it('transcreve com sucesso via Groq quando GROQ_API_KEY está presente', async () => {
    process.env.GROQ_API_KEY = 'mock-groq-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Paciente com dispneia e tosse seca', duration: 4.5 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const resultado = await transcreverAudio({
      buffer: Buffer.from('audio-content'),
      mimeType: 'audio/webm',
      originalName: 'consulta-paciente.webm',
    });

    expect(resultado.text).toBe('Paciente com dispneia e tosse seca');
    expect(resultado.provider).toBe('groq');
    expect(resultado.durationSeconds).toBe(4.5);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(callArgs[1].headers.Authorization).toBe('Bearer mock-groq-key');
  });

  it('faz fallback para OpenAI quando Groq falha', async () => {
    process.env.GROQ_API_KEY = 'mock-groq-key';
    process.env.OPENAI_API_KEY = 'mock-openai-key';

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Transcrição via OpenAI fallback', duration: 2.1 }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const resultado = await transcreverAudio({
      buffer: Buffer.from('audio-content'),
      mimeType: 'audio/mp3',
    });

    expect(resultado.text).toBe('Transcrição via OpenAI fallback');
    expect(resultado.provider).toBe('openai');
    expect(resultado.durationSeconds).toBe(2.1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const call1 = mockFetch.mock.calls[0];
    const call2 = mockFetch.mock.calls[1];
    expect(call1[0]).toContain('groq.com');
    expect(call2[0]).toContain('openai.com');
  });

  it('lida com timeout via AbortController', async () => {
    process.env.GROQ_API_KEY = 'mock-groq-key';

    const mockFetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    // Timeout de 50ms para teste rápido
    await expect(
      transcreverAudio({
        buffer: Buffer.from('audio-content'),
        mimeType: 'audio/webm',
        timeoutMs: 50,
      })
    ).rejects.toThrow();
  });
});
