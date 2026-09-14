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

// Cabeçalho de seção em cada Nota Técnica: ou tem o formato "Consulta em <Especialidade> - X"
// (usado em cardiologia/endocrinologia, e na maioria da dermatologia), ou é só um item de
// lista numerado de nível 1 como "6. Micoses"/"9. Prurido" (também em dermatologia, sem repetir
// "Consulta em..."). O `(?!\d)` depois do número exclui sub-itens como "1.1"/"8.1Condições..."
// (segundo nível), que sempre têm outro dígito colado no primeiro ponto.
const REGEX_CABECALHO = /^(?:##\s*)?(?:\d{1,2}\.\s+(?!\d).*|Consulta em (?:Cardiologia|Dermatologia|Endocrinologia)\s*-\s*.+)$/gm;

function capitalizar(especialidade: string): string {
  return especialidade.charAt(0).toUpperCase() + especialidade.slice(1);
}

function dividirEmChunks(texto: string, especialidade: string): { titulo: string; conteudo: string }[] {
  const cabecalhos = [...texto.matchAll(REGEX_CABECALHO)];
  const chunks: { titulo: string; conteudo: string }[] = [];

  for (let i = 0; i < cabecalhos.length; i++) {
    const inicio = cabecalhos[i].index!;
    const fim = i + 1 < cabecalhos.length ? cabecalhos[i + 1].index! : texto.length;
    let titulo = cabecalhos[i][0].replace(/^##\s*/, '').replace(/^\d{1,2}\.\s*/, '').trim();
    if (!titulo.includes('Consulta em')) {
      // Cabeçalhos "soltos" (ex: "Micoses", "Prurido") não repetem o prefixo no texto-fonte.
      titulo = `Consulta em ${capitalizar(especialidade)} - ${titulo}`;
    }
    const conteudo = texto.slice(inicio, fim).trim();
    chunks.push({ titulo, conteudo });
  }

  return chunks;
}

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
