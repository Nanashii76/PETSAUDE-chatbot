/**
 * Serviço de Extração de Texto de Documento
 *
 * Extrai o texto de um PDF anexado (ex: resultado de exame, laudo, encaminhamento recebido)
 * com `unpdf` (pdf.js empacotado, sem dependência nativa — mesma preocupação de memória do
 * Render free tier que levou à escolha de embeddings via API em vez de local; ver RAG vetorial).
 *
 * Diretrizes de LGPD e Segurança:
 * - O arquivo nunca é salvo em disco (multer em memória) nem persistido em banco — só o texto
 *   extraído, que o profissional ainda revisa antes de enviar (ver useDocumentUpload.ts).
 * - Nenhum conteúdo do documento (texto extraído ou bruto) é gravado em log. Logs contêm só
 *   metadados técnicos (nº de páginas, tamanho em caracteres/bytes).
 */
import { extractText } from 'unpdf';

export interface ExtrairDocumentoOptions {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

export interface ExtrairDocumentoResultado {
  texto: string;
  paginas: number;
  truncado: boolean;
}

// Mesma ordem de grandeza do [CONTEXTO CLÍNICO OFICIAL] injetado pelo RAG — um PDF maior que isso
// arrisca repetir os incidentes #5/#6 (JSON cortado no meio por estourar o orçamento de tokens dos
// modelos :free da cascata, ver docs-site/docs/incidentes.md).
const LIMITE_CARACTERES = 20_000;

const MIMES_SUPORTADOS = new Set(['application/pdf']);

export async function extrairTextoDocumento({
  buffer,
  mimeType,
}: ExtrairDocumentoOptions): Promise<ExtrairDocumentoResultado> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Documento vazio ou inválido.');
  }

  if (!MIMES_SUPORTADOS.has(mimeType.toLowerCase())) {
    throw new Error('Por enquanto só aceitamos PDF. Outros formatos (imagem, foto) ainda não são suportados.');
  }

  let resultado: { text: string; totalPages: number };
  try {
    // pdf.js recusa Buffer do Node — exige Uint8Array "puro".
    resultado = await extractText(new Uint8Array(buffer), { mergePages: true });
  } catch (error) {
    throw new Error('Não foi possível ler este PDF — o arquivo pode estar corrompido ou protegido.');
  }

  const textoOriginal = (resultado.text || '').trim();
  if (!textoOriginal) {
    throw new Error(
      'Não foi possível extrair texto deste PDF — provavelmente é um documento só com imagens escaneadas, sem camada de texto.'
    );
  }

  const truncado = textoOriginal.length > LIMITE_CARACTERES;
  const texto = truncado ? textoOriginal.slice(0, LIMITE_CARACTERES) : textoOriginal;

  return { texto, paginas: resultado.totalPages, truncado };
}
