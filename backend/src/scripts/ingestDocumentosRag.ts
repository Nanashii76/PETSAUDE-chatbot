import 'dotenv/config';
import { Pool } from 'pg';
import { gerarEmbedding } from '../services/embeddings.js';
import { DOC_CARDIOLOGIA, DOC_DERMATOLOGIA, DOC_ENDOCRINOLOGIA } from '../core/documents.js';
import { dividirEmChunks } from '../core/chunking.js';

// Script de ingestão manual (não roda em produção). Repita a execução sempre que
// os textos das Notas Técnicas em core/documents.ts forem alterados:
//   npx tsx src/scripts/ingestDocumentosRag.ts

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DOCUMENTOS: { especialidade: string; texto: string }[] = [
  { especialidade: 'cardiologia', texto: DOC_CARDIOLOGIA },
  { especialidade: 'dermatologia', texto: DOC_DERMATOLOGIA },
  { especialidade: 'endocrinologia', texto: DOC_ENDOCRINOLOGIA },
];

async function ingerir() {
  // Idempotente: pode rodar de novo sempre que os documentos-fonte mudarem, sem duplicar linhas.
  await pool.query('TRUNCATE TABLE documentos_rag');

  for (const doc of DOCUMENTOS) {
    const chunks = dividirEmChunks(doc.texto, doc.especialidade);
    console.log(`[Ingestão] ${doc.especialidade}: ${chunks.length} chunks encontrados.`);

    for (const chunk of chunks) {
      const embedding = await gerarEmbedding(chunk.conteudo, 'passage');
      const embeddingStr = `[${embedding.join(',')}]`;

      await pool.query(
        `INSERT INTO documentos_rag (especialidade, titulo, conteudo, embedding) VALUES ($1, $2, $3, $4)`,
        [doc.especialidade, chunk.titulo, chunk.conteudo, embeddingStr]
      );
      console.log(`  -> inserido: ${chunk.titulo}`);
    }
  }

  await pool.end();
  console.log('[Ingestão] Concluída.');
}

ingerir().catch((error) => {
  console.error('[Ingestão] Falha:', error);
  process.exit(1);
});
