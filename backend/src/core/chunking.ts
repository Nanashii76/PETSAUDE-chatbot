// Cabeçalho de seção em cada Nota Técnica: ou tem o formato "Consulta em <Especialidade> - X"
// (usado em cardiologia/endocrinologia, e na maioria da dermatologia), ou é só um item de
// lista numerado de nível 1 como "6. Micoses"/"9. Prurido" (também em dermatologia, sem repetir
// "Consulta em..."). O `(?!\d)` depois do número exclui sub-itens como "1.1"/"8.1Condições..."
// (segundo nível), que sempre têm outro dígito colado no primeiro ponto.
export const REGEX_CABECALHO = /^(?:##\s*)?(?:\d{1,2}\.\s+(?!\d).*|Consulta em (?:Cardiologia|Dermatologia|Endocrinologia)\s*-\s*.+)$/gm;

export function capitalizar(especialidade: string): string {
  return especialidade.charAt(0).toUpperCase() + especialidade.slice(1);
}

export function dividirEmChunks(texto: string, especialidade: string): { titulo: string; conteudo: string }[] {
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
