import { Pool } from 'pg';
import dotenv from 'dotenv';
import { gerarEmbedding } from './embeddings.js';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ESPECIALIDADES_COM_RAG = ['cardiologia', 'dermatologia', 'endocrinologia'];

export type FonteRag = { titulo: string; similarity: number };
export type ResultadoRag = { contexto: string; fontes: FonteRag[] };

/**
 * Recupera só os trechos relevantes da Nota Técnica (via busca vetorial), em vez
 * de injetar o documento inteiro no prompt. Independente de qual LLM vai gerar a
 * resposta — o embedding roda localmente, desacoplado do OpenRouter.
 */
export async function buscarContexto(query: string, agenteAtual: string, limite = 4): Promise<ResultadoRag> {
  if (!ESPECIALIDADES_COM_RAG.includes(agenteAtual)) {
    // Orquestrador ou dúvidas gerais não têm Nota Técnica associada.
    return { contexto: '', fontes: [] };
  }

  try {
    const embedding = await gerarEmbedding(query, 'query');
    const embeddingStr = `[${embedding.join(',')}]`;

    const result = await pool.query(
      `SELECT * FROM match_documentos($1, $2, $3)`,
      [embeddingStr, agenteAtual, limite]
    );

    if (result.rows.length === 0) {
      return { contexto: '', fontes: [] };
    }

    const contexto = result.rows.map((row) => row.conteudo).join('\n\n---\n\n');
    const fontes = result.rows.map((row) => ({ titulo: row.titulo, similarity: row.similarity }));

    console.log(`[RAG] Recuperados ${result.rows.length} trechos para "${agenteAtual}": ${fontes.map((f) => f.titulo).join(', ')}`);

    return { contexto, fontes };
  } catch (error) {
    console.error(`[RAG] Erro ao buscar contexto vetorial para ${agenteAtual}:`, error);
    return { contexto: '', fontes: [] }; // Em caso de erro, segue sem contexto em vez de travar a conversa
  }
}
