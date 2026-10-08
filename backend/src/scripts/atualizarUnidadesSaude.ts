import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Script de manutenção manual (não roda em produção). Repita a execução de tempos em tempos para
// manter a lista de unidades de saúde em dia — o CNES muda (novas UBS, renomeações, fechamentos):
//   npx tsx src/scripts/atualizarUnidadesSaude.ts
//
// Fonte: API de Dados Abertos do Ministério da Saúde (CNES), sem autenticação:
// https://apidadosabertos.saude.gov.br/cnes/estabelecimentos (município 530010 = Brasília/DF;
// codigo_tipo_unidade 1 = posto de saúde, 2 = centro de saúde/unidade básica). Filtra só unidades
// da SES-DF (CNPJ 00394700000108). A região de saúde não vem no CNES: é derivada da região
// administrativa (RA) pela tabela RA_REGIAO abaixo — mesma fonte e lógica do projeto irmão chatbot2
// (bin/atualizar-ubs), adaptada para TypeScript.
//
// Gera backend/src/dados/unidades_saude.json, carregado em runtime por core/unidades.ts. Não é uma
// chamada ao vivo por requisição: a lista fica estática no app até a próxima execução deste script,
// para a tela de identificação do profissional não depender da API do governo estar no ar.

const API = 'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const CNPJ_SES = '00394700000108';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(__dirname, '..', 'dados', 'unidades_saude.json');

type Estabelecimento = {
  codigo_cnes: number;
  numero_cnpj_entidade: string;
  nome_razao_social: string;
  nome_fantasia: string;
  bairro_estabelecimento: string;
  endereco_email_estabelecimento: string | null;
};

type Unidade = { cnes: string; nome: string; ra: string | null; regiao: string | null; tipo: string };

// Região administrativa → região de saúde da SES-DF.
const RA_REGIAO: Record<string, string> = {
  'Plano Piloto': 'Central', 'Lago Norte': 'Central', 'Lago Sul': 'Central', 'Varjão': 'Central',
  'Cruzeiro': 'Central', 'Sudoeste/Octogonal': 'Central',
  'Guará': 'Centro-Sul', 'Núcleo Bandeirante': 'Centro-Sul', 'Riacho Fundo': 'Centro-Sul',
  'Riacho Fundo II': 'Centro-Sul', 'Candangolândia': 'Centro-Sul', 'Park Way': 'Centro-Sul',
  'SCIA/Estrutural': 'Centro-Sul', 'SIA': 'Centro-Sul',
  'Paranoá': 'Leste', 'São Sebastião': 'Leste', 'Itapoã': 'Leste', 'Jardim Botânico': 'Leste',
  'Planaltina': 'Norte', 'Sobradinho': 'Norte', 'Sobradinho II': 'Norte', 'Fercal': 'Norte',
  'Ceilândia': 'Oeste', 'Brazlândia': 'Oeste',
  'Taguatinga': 'Sudoeste', 'Samambaia': 'Sudoeste', 'Recanto das Emas': 'Sudoeste',
  'Águas Claras': 'Sudoeste', 'Vicente Pires': 'Sudoeste',
  'Gama': 'Sul', 'Santa Maria': 'Sul',
};

// Termos que aparecem nos nomes/bairros do CNES (sem acento, maiúsculas) → RA. Ordem: mais específicos primeiro.
const TERMOS_RA: [string, string][] = [
  ['RIACHO FUNDO II', 'Riacho Fundo II'], ['RIACHO FUNDO', 'Riacho Fundo'], ['SOBRADINHO II', 'Sobradinho II'],
  ['SOBRADINHO', 'Sobradinho'], ['ASA NORTE', 'Plano Piloto'], ['ASA SUL', 'Plano Piloto'],
  ['VILA PLANALTO', 'Plano Piloto'], ['GRANJA DO TORTO', 'Plano Piloto'], ['GRANJA TORTO', 'Plano Piloto'],
  ['BRASILIA', 'Plano Piloto'], ['DCCP', 'Plano Piloto'], ['LAGO NORTE', 'Lago Norte'], ['LAGO SUL', 'Lago Sul'],
  ['VARJAO', 'Varjão'], ['CRUZEIRO', 'Cruzeiro'], ['GUARA', 'Guará'], ['SIA', 'SIA'],
  ['NUCLEO BANDEIRANTE', 'Núcleo Bandeirante'], ['CANDANGOLANDIA', 'Candangolândia'], ['PARK WAY', 'Park Way'],
  ['ESTRUTURAL', 'SCIA/Estrutural'], ['PARANOA', 'Paranoá'], ['SAO SEBASTIAO', 'São Sebastião'],
  ['ITAPOA', 'Itapoã'], ['JARDIM BOTANICO', 'Jardim Botânico'], ['MANGUEIRAL', 'Jardim Botânico'],
  ['PLANALTINA', 'Planaltina'], ['ARAPOANGA', 'Planaltina'], ['FERCAL', 'Fercal'], ['CEILANDIA', 'Ceilândia'],
  ['CAIC BERNARDO SAYAO', 'Ceilândia'], ['VISTA BELA', 'Ceilândia'], ['BRAZLANDIA', 'Brazlândia'],
  ['TAGUATINGA', 'Taguatinga'], ['SAMAMBAIA', 'Samambaia'], ['SAMAMABAIA', 'Samambaia'],
  ['RECANTO DAS EMAS', 'Recanto das Emas'], ['AGUAS CLARAS', 'Águas Claras'], ['VICENTE PIRES', 'Vicente Pires'],
  ['GAMA', 'Gama'], ['SANTA MARIA', 'Santa Maria'],
  // Hospitais Regionais e Centrais
  ['HRG', 'Gama'], ['HRT', 'Taguatinga'], ['HRAN', 'Plano Piloto'], ['HRS', 'Sobradinho'],
  ['HRSM', 'Santa Maria'], ['HRC', 'Ceilândia'], ['HRBZ', 'Brazlândia'], ['HRPA', 'Paranoá'],
  ['HRSA', 'Samambaia'], ['HSVP', 'Taguatinga'], ['HMIB', 'Plano Piloto'], ['HAB', 'Plano Piloto'],
  ['COMPLEXO REGULADOR', 'Plano Piloto'], ['CRDF', 'Plano Piloto'], ['SAMU DF', 'Plano Piloto'],
  ['CENTRO DE ESPECIALIDADE ODONTOLOGICA', 'Plano Piloto'],
  ['GARDENIA', 'Taguatinga'],
  ['CER II', 'Plano Piloto'],
  ['CENTRO MEDICO DA PM', 'Plano Piloto']
];

// E-mail das unidades: sufixos que indicam a região (conferência cruzada da tabela acima).
const EMAIL_REGIAO: Record<string, string> = {
  oeste: 'Oeste', sul: 'Sul', srssu: 'Sul', norte: 'Norte', leste: 'Leste',
  central: 'Central', srsso: 'Sudoeste', sudoeste: 'Sudoeste', centrosul: 'Centro-Sul',
};

// Mapeamento de tipos CNES
const TIPO_MAP: Record<number, string> = {
  1: 'UBS', 2: 'UBS',
  4: 'Policlínica',
  5: 'Hospital', 7: 'Hospital',
  36: 'CEO',
  61: 'Casa de Parto',
  70: 'CAPS',
  73: 'UPA',
  76: 'Regulação', 81: 'Regulação'
};

const SIGLAS_E_NUMEROS = new Set([
  'UBS', 'PSF', 'PSR', 'CAIC', 'PDF', 'CDP', 'ATP', 'PFDF', 'PADDF', 'DCCP', 'CPP', 'SIA', 'QN', 'QS',
  'CIR', 'II', 'IV', 'T', 'R', 'E',
  'HRG', 'HRT', 'HRAN', 'HRS', 'HRSM', 'HRC', 'HRBZ', 'HRPA', 'HRSA', 'HSVP', 'HMIB', 'HAB',
  'CEO', 'UPA', 'CAPS', 'CRDF', 'SAMU', 'I', 'III'
]);
const ARTIGOS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS']);

function semAcento(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

async function baixar(tipo: number): Promise<Estabelecimento[]> {
  const todos: Estabelecimento[] = [];
  let inicio = 0;
  for (;;) {
    const url = `${API}?codigo_municipio=530010&codigo_tipo_unidade=${tipo}&limit=20&offset=${inicio}`;
    const resposta = await fetch(url);
    if (!resposta.ok) {
      throw new Error(`CNES respondeu ${resposta.status} em ${url}`);
    }
    const dados = (await resposta.json()) as { estabelecimentos: Estabelecimento[] };
    const lote = dados.estabelecimentos || [];
    if (lote.length === 0) return todos;
    todos.push(...lote);
    inicio += 20;
  }
}

function nomeLegivel(nome: string): string {
  // 'UBS 13 SAMAMBAIA' → 'UBS 13 Samambaia' (siglas curtas e números ficam em maiúsculas).
  return nome
    .split(' ')
    .map((p) => {
      if (SIGLAS_E_NUMEROS.has(p) || /\d/.test(p)) return p;
      if (ARTIGOS.has(p)) return p.toLowerCase();
      return p.charAt(0) + p.slice(1).toLowerCase();
    })
    .join(' ');
}

async function main() {
  const unidades: Unidade[] = [];
  let conferidas = 0;
  const divergentes: [string, string, string][] = [];

  const brutos: (Estabelecimento & { _tipo_cod: number })[] = [];
  for (const t of Object.keys(TIPO_MAP).map(Number)) {
    const baixados = await baixar(t);
    brutos.push(...baixados.map(b => ({ ...b, _tipo_cod: t })));
  }

  for (const e of brutos) {
    if (e.numero_cnpj_entidade !== CNPJ_SES) continue;

    const texto = semAcento(`${e.nome_fantasia} ${e.nome_razao_social}`);
    const busca = `${texto} ${semAcento(e.bairro_estabelecimento || '')}`;
    const achado = TERMOS_RA.find(([termo]) => new RegExp(`\\b${termo}\\b`).test(busca));
    const ra = achado ? achado[1] : null;
    const regiao = ra ? RA_REGIAO[ra] ?? null : null;

    const email = (e.endereco_email_estabelecimento || '').toLowerCase();
    const pista = Object.entries(EMAIL_REGIAO).find(([chave]) =>
      new RegExp(`[.\\d_-]${chave}(?:\\b|@)`).test(email)
    )?.[1];
    if (pista && regiao) {
      conferidas += 1;
      if (pista !== regiao) divergentes.push([e.nome_fantasia, regiao, pista]);
    }

    unidades.push({
      cnes: String(e.codigo_cnes),
      nome: nomeLegivel(e.nome_fantasia),
      ra,
      regiao,
      tipo: TIPO_MAP[e._tipo_cod] || 'Outro'
    });
  }

  unidades.sort((a, b) => {
    const chave = (u: Unidade) => `${u.regiao ?? '~'}|${u.ra ?? '~'}|${u.nome}`;
    return chave(a).localeCompare(chave(b));
  });

  const saida = {
    fonte: `${API} (codigo_municipio=530010, codigo_tipo_unidade = ${Object.keys(TIPO_MAP).join(', ')}, CNPJ da SES-DF)`,
    atualizado_em: new Date().toISOString().slice(0, 10),
    regiao_derivada_da_ra: 'a região de saúde não vem no CNES; derivada da RA, a confirmar com a SES-DF',
    unidades,
  };

  mkdirSync(path.dirname(SAIDA), { recursive: true });
  writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf-8');

  const semRegiao = unidades.filter((u) => !u.regiao).map((u) => u.nome);
  console.log(`${unidades.length} unidades; região conferida pelo e-mail em ${conferidas}; divergências:`, divergentes);
  console.log('sem região:', semRegiao);
}

main().catch((erro) => {
  console.error('[Unidades] Falha:', erro);
  process.exit(1);
});
