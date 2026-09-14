import 'dotenv/config';
import { Pool } from 'pg';
import { gerarEmbedding } from '../services/embeddings.js';
import { DOC_CARDIOLOGIA, DOC_DERMATOLOGIA, DOC_ENDOCRINOLOGIA } from '../core/documents.js';

// Script de ingestão manual (não roda em produção). Repita a execução sempre que
// os textos das Notas Técnicas em core/documents.ts forem alterados:
//   npx tsx src/scripts/ingestDocumentosRag.ts

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DOCUMENTOS: { especialidade: string; texto: string }[] = [
  { especialidade: 'cardiologia', texto: DOC_CARDIOLOGIA },
  { especialidade: 'dermatologia', texto: DOC_DERMATOLOGIA },
  { especialidade: 'endocrinologia', texto: DOC_ENDOCRINOLOGIA },
];

// Cada Nota Técnica já é dividida por condição clínica, e todo cabeçalho de seção
// contém literalmente "Consulta em <Especialidade> - <Condição>" — serve como
// delimitador de chunk mesmo a numeração variando entre documentos ("## X" na
// cardiologia, "N. X" na dermatologia, texto puro na endocrinologia).
const REGEX_CABECALHO = /^(?:##\s*)?(?:\d+\.\s*)?Consulta em (?:Cardiologia|Dermatologia|Endocrinologia)\s*-\s*.+$/gm;

function dividirEmChunks(texto: string): { titulo: string; conteudo: string }[] {
  const cabecalhos = [...texto.matchAll(REGEX_CABECALHO)];
  const chunks: { titulo: string; conteudo: string }[] = [];

  for (let i = 0; i < cabecalhos.length; i++) {
    const inicio = cabecalhos[i].index!;
    const fim = i + 1 < cabecalhos.length ? cabecalhos[i + 1].index! : texto.length;
    const titulo = cabecalhos[i][0].replace(/^##\s*/, '').replace(/^\d+\.\s*/, '').trim();
    const conteudo = texto.slice(inicio, fim).trim();
    chunks.push({ titulo, conteudo });
  }

  return chunks;
}

async function ingerir() {
  for (const doc of DOCUMENTOS) {
    const chunks = dividirEmChunks(doc.texto);
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
