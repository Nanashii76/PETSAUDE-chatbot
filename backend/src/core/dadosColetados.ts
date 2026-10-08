// Guarda-corpo compartilhado: o LLM às vezes preenche um campo com null, string vazia ou até as
// strings literais "null"/"undefined" em vez de simplesmente omitir a chave (apesar de instruído a
// não fazer isso — ver prompts.ts). Sem este filtro, esses valores vazam para o resumo de
// confirmação, o relatório da regulação e os dados gravados em encaminhamentos.dados_estruturados.

export function valorVazio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') {
    const limpo = valor.trim().toLowerCase();
    return limpo === '' || limpo === 'null' || limpo === 'undefined';
  }
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor === 'object') return Object.keys(valor).length === 0;
  return false;
}

// Chaves internas (prefixo "_") nunca são removidas, mesmo com valor "vazio" (ex: flags booleanas),
// pois controlam o estado da conversa — só os campos de dados clínicos passam pelo filtro.
export function limparDadosColetados(dados: Record<string, any>): Record<string, any> {
  const limpo: Record<string, any> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    if (chave.startsWith('_') || !valorVazio(valor)) {
      limpo[chave] = valor;
    }
  }
  return limpo;
}
