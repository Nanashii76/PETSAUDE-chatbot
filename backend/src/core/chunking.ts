// Cabeçalho de seção em cada Nota Técnica: ou tem o formato "Consulta em <Especialidade> - X"
// (usado em cardiologia/endocrinologia, e na maioria da dermatologia), ou é só um item de
// lista numerado de nível 1 como "6. Micoses"/"9. Prurido" (também em dermatologia, sem repetir
// "Consulta em..."). O `(?!\d)` depois do número exclui sub-itens como "1.1"/"8.1Condições..."
// (segundo nível), que sempre têm outro dígito colado no primeiro ponto.
export const REGEX_CABECALHO = /^(?:##\s*)?(?:\d{1,2}\.\s+(?!\d).*|Consulta em (?:Cardiologia|Dermatologia|Endocrinologia)\s*-\s*.+)$/gm;

// Marcador que introduz a lista de campos obrigatórios de cada condição clínica. Aparece em todos
// os 29 chunks das 3 Notas Técnicas, com ou sem ":" no final.
const MARCADOR_CAMPOS_MINIMOS = 'Conteúdo descritivo mínimo que o encaminhamento deve ter';

// Numeração residual no início de uma linha (ex: "1.2.1.", "8.2.3", "10.2.") que sobra quando o
// item é um sub-tópico numerado (comum na dermatologia) — não faz parte do conteúdo do campo.
const REGEX_NUMERACAO_RESIDUAL = /^\d+(?:\.\d+)*\.?\s*/;

export function capitalizar(especialidade: string): string {
  return especialidade.charAt(0).toUpperCase() + especialidade.slice(1);
}

/**
 * Extrai a lista de campos obrigatórios ("Conteúdo descritivo mínimo...") do texto de um chunk.
 * Feito uma única vez na ingestão, para o LLM não precisar reler o parágrafo em todo turno.
 */
export function extrairCamposMinimos(conteudo: string): string[] {
  const indiceMarcador = conteudo.indexOf(MARCADOR_CAMPOS_MINIMOS);
  if (indiceMarcador === -1) return [];

  let resto = conteudo.slice(indiceMarcador + MARCADOR_CAMPOS_MINIMOS.length);
  resto = resto.replace(/^:/, '');

  return resto
    .split('\n')
    .map((linha) => linha.replace(REGEX_NUMERACAO_RESIDUAL, '').trim())
    .filter((linha) => linha.length > 0);
}

export function dividirEmChunks(
  texto: string,
  especialidade: string
): { titulo: string; conteudo: string; camposMinimos: string[] }[] {
  const cabecalhos = [...texto.matchAll(REGEX_CABECALHO)];
  const chunks: { titulo: string; conteudo: string; camposMinimos: string[] }[] = [];

  for (let i = 0; i < cabecalhos.length; i++) {
    const inicio = cabecalhos[i].index!;
    const fim = i + 1 < cabecalhos.length ? cabecalhos[i + 1].index! : texto.length;
    let titulo = cabecalhos[i][0].replace(/^##\s*/, '').replace(/^\d{1,2}\.\s*/, '').trim();
    if (!titulo.includes('Consulta em')) {
      // Cabeçalhos "soltos" (ex: "Micoses", "Prurido") não repetem o prefixo no texto-fonte.
      titulo = `Consulta em ${capitalizar(especialidade)} - ${titulo}`;
    }
    const conteudo = texto.slice(inicio, fim).trim();
    chunks.push({ titulo, conteudo, camposMinimos: extrairCamposMinimos(conteudo) });
  }

  return chunks;
}
