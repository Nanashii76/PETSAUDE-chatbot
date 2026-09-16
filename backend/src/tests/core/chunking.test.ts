import { describe, it, expect } from 'vitest';
import { dividirEmChunks } from '../../core/chunking.js';

describe('dividirEmChunks', () => {
  it('divide cabeçalhos no estilo cardiologia ("## Consulta em X - Y")', () => {
    const texto = `
## Consulta em Cardiologia - Arritmia / Síncope

Condições clínicas...

## Consulta em Cardiologia - Hipertensão Arterial Sistêmica

Outras condições...
`;
    const chunks = dividirEmChunks(texto, 'cardiologia');

    expect(chunks).toHaveLength(2);
    expect(chunks[0].titulo).toBe('Consulta em Cardiologia - Arritmia / Síncope');
    expect(chunks[0].conteudo).toContain('Condições clínicas...');
    expect(chunks[1].titulo).toBe('Consulta em Cardiologia - Hipertensão Arterial Sistêmica');
  });

  it('divide cabeçalhos no estilo endocrinologia (sem numeração nem "##")', () => {
    const texto = `
Consulta em Endocrinologia - Diabetes Mellitus

Critérios de diabetes...

Consulta em Endocrinologia - Nódulo de Tireoide

Critérios de nódulo...
`;
    const chunks = dividirEmChunks(texto, 'endocrinologia');

    expect(chunks).toHaveLength(2);
    expect(chunks[0].titulo).toBe('Consulta em Endocrinologia - Diabetes Mellitus');
    expect(chunks[1].titulo).toBe('Consulta em Endocrinologia - Nódulo de Tireoide');
  });

  it('divide cabeçalhos numerados com prefixo ("1. Consulta em Dermatologia - Acne")', () => {
    const texto = `
1. Consulta em Dermatologia - Acne
1.1 Condições clínicas que indicam a necessidade de encaminhamento para ambulatorial:
1.1.1 acne fulminans

2. Consulta em Dermatologia - Melanoma
2.1. Condições clínicas...
`;
    const chunks = dividirEmChunks(texto, 'dermatologia');

    expect(chunks).toHaveLength(2);
    expect(chunks[0].titulo).toBe('Consulta em Dermatologia - Acne');
    expect(chunks[1].titulo).toBe('Consulta em Dermatologia - Melanoma');
  });

  it('regressão: cabeçalho numerado "solto" (sem "Consulta em") vira chunk próprio, com título normalizado', () => {
    const texto = `
5. Consulta em Dermatologia - Eczemas
5.1. Condições clínicas...

6. Micoses
6.1. Condições clínicas...

7. Consulta em Dermatologia - Psoríase
7.1. Condições clínicas...
`;
    const chunks = dividirEmChunks(texto, 'dermatologia');

    expect(chunks).toHaveLength(3);
    expect(chunks[1].titulo).toBe('Consulta em Dermatologia - Micoses');
    expect(chunks[1].conteudo).toContain('6. Micoses');
    // O conteúdo de "Micoses" não deve vazar para o chunk de Eczemas
    expect(chunks[0].conteudo).not.toContain('Micoses');
  });

  it('não trata sub-itens ("N.N") como novo cabeçalho, mesmo sem espaço após o ponto', () => {
    const texto = `
8. Consulta em Dermatologia - Alopecia
8.1Condições clínicas que indicam a necessidade de encaminhamento para dermatologia:
8.1.1 Surgimento agudo de placas alopécicas circunscritas; ou
8.1.2. queda de cabelo há pelo menos 6 meses

9. Prurido
9.1. Condições clínicas...
`;
    const chunks = dividirEmChunks(texto, 'dermatologia');

    expect(chunks).toHaveLength(2);
    expect(chunks[0].titulo).toBe('Consulta em Dermatologia - Alopecia');
    expect(chunks[0].conteudo).toContain('8.1.2. queda de cabelo');
    expect(chunks[1].titulo).toBe('Consulta em Dermatologia - Prurido');
  });

  it('o último chunk vai até o fim do texto', () => {
    const texto = `
## Consulta em Cardiologia - Valvopatias

Conteúdo final sem mais cabeçalhos depois.
Mais uma linha.
`;
    const chunks = dividirEmChunks(texto, 'cardiologia');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].conteudo).toContain('Mais uma linha.');
  });

  it('retorna lista vazia quando não há nenhum cabeçalho reconhecível', () => {
    const chunks = dividirEmChunks('Texto solto sem nenhum cabeçalho de seção.', 'cardiologia');
    expect(chunks).toHaveLength(0);
  });
});
