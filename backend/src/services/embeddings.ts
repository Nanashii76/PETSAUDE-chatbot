import dotenv from 'dotenv';

dotenv.config();

// Modelo de embedding gratuito do Google (quota generosa no free tier), chamado via
// fetch puro — sem SDK, sem custo, e desacoplado do LLM de chat (que continua no
// OpenRouter). Truncamos via outputDimensionality para bater com o schema (VECTOR(768)).
const MODELO = 'gemini-embedding-001';
const DIMENSAO = 768;
const URL_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:embedContent`;

const TASK_TYPE: Record<'query' | 'passage', string> = {
  query: 'RETRIEVAL_QUERY',
  passage: 'RETRIEVAL_DOCUMENT',
};

/**
 * Gera o vetor de embedding de um texto via API do Gemini. `tipo` indica se o texto
 * é uma busca ('query') ou um trecho indexado ('passage') — a API usa esse sinal
 * para otimizar a qualidade da recuperação (equivalente ao prefixo dos modelos e5).
 */
export async function gerarEmbedding(texto: string, tipo: 'query' | 'passage'): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não está configurada no .env");
  }

  const response = await fetch(`${URL_BASE}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${MODELO}`,
      content: { parts: [{ text: texto }] },
      taskType: TASK_TYPE[tipo],
      outputDimensionality: DIMENSAO,
    }),
  });

  if (!response.ok) {
    const corpo = await response.text();
    throw new Error(`[Embeddings] Falha na API do Gemini (${response.status}): ${corpo}`);
  }

  const data = await response.json();
  return data.embedding.values as number[];
}
