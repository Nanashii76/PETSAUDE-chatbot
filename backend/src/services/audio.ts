/**
 * Serviço de Transcrição de Áudio
 * 
 * Utiliza serviços gerenciados ultraleves (Groq Whisper com fallback para OpenAI Whisper),
 * evitando qualquer carga de inferência/modelo local no servidor Node.js.
 * 
 * Diretrizes de LGPD e Segurança:
 * - Nenhum dado clínico, áudio bruto ou texto transcrito deve ser gravado em logs.
 * - Todos os logs contêm apenas metadados técnicos (duração, status, provedor, tamanho em bytes).
 */

export interface TranscribeOptions {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
  timeoutMs?: number;
}

export interface TranscribeResult {
  text: string;
  provider: 'groq' | 'openai';
  durationSeconds?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000; // 20 segundos

/**
 * Normaliza extensão/nome de arquivo com base no MIME type para envio seguro à API de Whisper
 */
function obterNomeArquivoParaMime(mimeType: string, originalName?: string): string {
  if (originalName && /\.(webm|m4a|mp4|wav|mp3|ogg)$/i.test(originalName)) {
    // Sanitiza o nome original para remover qualquer informação identificável
    const ext = originalName.split('.').pop()?.toLowerCase() || 'webm';
    return `audio.${ext}`;
  }

  const mimeMap: Record<string, string> = {
    'audio/webm': 'audio.webm',
    'audio/mp4': 'audio.m4a',
    'audio/m4a': 'audio.m4a',
    'audio/x-m4a': 'audio.m4a',
    'audio/wav': 'audio.wav',
    'audio/wave': 'audio.wav',
    'audio/x-wav': 'audio.wav',
    'audio/mpeg': 'audio.mp3',
    'audio/mp3': 'audio.mp3',
    'audio/ogg': 'audio.ogg',
    'audio/opus': 'audio.ogg',
  };

  return mimeMap[mimeType.toLowerCase()] || 'audio.webm';
}

/**
 * Transcreve áudio via Groq Whisper API (whisper-large-v3 ou whisper-large-v3-turbo)
 */
async function transcreverComGroq(
  blob: Blob,
  fileName: string,
  apiKey: string,
  timeoutMs: number
): Promise<{ text: string; duration?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const status = res.status;
      throw new Error(`Groq Whisper retornou status HTTP ${status}`);
    }

    const data = await res.json() as { text?: string; duration?: number };
    const text = (data.text || '').trim();

    return {
      text,
      duration: data.duration,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transcreve áudio via OpenAI Whisper API (whisper-1) como Fallback
 */
async function transcreverComOpenAI(
  blob: Blob,
  fileName: string,
  apiKey: string,
  timeoutMs: number
): Promise<{ text: string; duration?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const status = res.status;
      throw new Error(`OpenAI Whisper retornou status HTTP ${status}`);
    }

    const data = await res.json() as { text?: string; duration?: number };
    const text = (data.text || '').trim();

    return {
      text,
      duration: data.duration,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Função principal de transcrição com cascata de fallback
 */
export async function transcreverAudio(options: TranscribeOptions): Promise<TranscribeResult> {
  const { buffer, mimeType, originalName, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (!buffer || buffer.length === 0) {
    throw new Error('Áudio vazio ou inválido.');
  }

  const fileName = obterNomeArquivoParaMime(mimeType, originalName);
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });

  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    console.error('[AudioTranscribe] Nenhuma chave de API de transcrição configurada (GROQ_API_KEY ou OPENAI_API_KEY).');
    throw new Error('Serviço de transcrição indisponível (chaves não configuradas).');
  }

  const inicio = Date.now();

  // 1. Tentar Groq se houver chave configurada
  if (groqKey) {
    try {
      const resultado = await transcreverComGroq(blob, fileName, groqKey, timeoutMs);
      const decorrido = Date.now() - inicio;
      // LGPD: Log técnico sem dados clínicos nem transcrição
      console.log(`[AudioTranscribe] Transcrição concluída via Groq em ${decorrido}ms (tamanho: ${buffer.length} bytes).`);
      return {
        text: resultado.text,
        provider: 'groq',
        durationSeconds: resultado.duration,
      };
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Timeout excedido' : (err?.message || 'Erro desconhecido');
      console.warn(`[AudioTranscribe] Falha no Groq Whisper (${msg}). Tentando fallback se disponível...`);
    }
  }

  // 2. Fallback para OpenAI se houver chave
  if (openaiKey) {
    try {
      const resultado = await transcreverComOpenAI(blob, fileName, openaiKey, timeoutMs);
      const decorrido = Date.now() - inicio;
      // LGPD: Log técnico sem dados clínicos nem transcrição
      console.log(`[AudioTranscribe] Transcrição concluída via OpenAI Fallback em ${decorrido}ms (tamanho: ${buffer.length} bytes).`);
      return {
        text: resultado.text,
        provider: 'openai',
        durationSeconds: resultado.duration,
      };
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Timeout excedido' : (err?.message || 'Erro desconhecido');
      console.error(`[AudioTranscribe] Falha na OpenAI Whisper Fallback (${msg}).`);
      throw new Error('Falha no serviço de transcrição de áudio.');
    }
  }

  throw new Error('Todos os provedores de transcrição falharam.');
}
