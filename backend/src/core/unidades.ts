import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Unidades de atenção primária da SES-DF (CNES), para o profissional informar onde atua antes de
// começar o chat. Lista estática gerada por scripts/atualizarUnidadesSaude.ts — não é buscada ao
// vivo em cada requisição (a API do CNES poderia estar fora do ar bem na hora que alguém for usar o
// chat).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(__dirname, '..', 'dados', 'unidades_saude.json');

export type Unidade = { cnes: string; nome: string; ra: string | null; regiao: string | null; rotulo: string };

// Quem não atua numa UBS também usa o sistema (regulação, ensino, outros serviços).
const ESPECIAIS: Record<string, Omit<Unidade, 'rotulo'>> = {
  regulacao: { cnes: 'regulacao', nome: 'Regulação (não atuo em UBS)', ra: null, regiao: null },
  outro: { cnes: 'outro', nome: 'Outro serviço ou ensino', ra: null, regiao: null },
};

function semAcento(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function normalizar(texto: string): string[] {
  const t = semAcento(texto);
  const palavras = t.match(/[a-z]+|\d+/g) || [];
  const ignoradas = new Set(['de', 'da', 'do', 'n', 'no', 'numero']);
  return palavras.filter((p) => !ignoradas.has(p)).map((p) => (/^\d+$/.test(p) ? String(parseInt(p, 10)) : p));
}

let _unidades: Unidade[] | null = null;

export function listarUnidades(): Unidade[] {
  if (_unidades) return _unidades;

  const bruto = JSON.parse(readFileSync(ARQUIVO, 'utf-8')) as { unidades: Omit<Unidade, 'rotulo'>[] };
  const nomes = bruto.unidades.map((u) => u.nome);
  const comRotulo: Unidade[] = bruto.unidades.map((u) => {
    // Rótulo único para a lista de escolha: nome + RA; o CNES desempata nomes repetidos no cadastro.
    const raNoNome = !!u.ra && semAcento(u.ra).includes(semAcento(u.nome));
    const base = raNoNome ? u.nome : `${u.nome} (${u.ra})`;
    const rotulo = nomes.filter((n) => n === u.nome).length > 1 ? `${base} – CNES ${u.cnes}` : base;
    return { ...u, rotulo };
  });

  const especiais: Unidade[] = Object.values(ESPECIAIS).map((e) => ({ ...e, rotulo: e.nome }));
  _unidades = [...comRotulo, ...especiais];
  return _unidades;
}

export function porCnes(cnes: string): Unidade | undefined {
  return listarUnidades().find((u) => u.cnes === cnes);
}

export function buscarUnidades(texto: string): Unidade[] {
  const termos = normalizar(texto);
  if (termos.length === 0) return [];

  const chave = texto.trim().toLowerCase();
  if (chave.includes('regula')) {
    const r = ESPECIAIS.regulacao;
    return [{ ...r, rotulo: r.nome }];
  }
  if (['outro', 'outra', 'ensino', 'outro servico', 'outro serviço'].includes(chave)) {
    const o = ESPECIAIS.outro;
    return [{ ...o, rotulo: o.nome }];
  }

  return listarUnidades()
    .filter((u) => !(u.cnes in ESPECIAIS))
    .filter((u) => {
      const palavras = new Set(normalizar(`${u.rotulo} ${u.ra || ''} ${u.regiao || ''}`));
      return termos.every(
        (t) => palavras.has(t) || (t.length > 3 && [...palavras].some((p) => p.startsWith(t)))
      );
    });
}
