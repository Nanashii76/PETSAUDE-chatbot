import { describe, it, expect } from 'vitest';
import { listarUnidades, buscarUnidades, porCnes } from '../../core/unidades.js';

describe('unidades', () => {
  it('carrega a lista real do JSON com as entradas especiais no final', () => {
    const lista = listarUnidades();
    expect(lista.length).toBeGreaterThan(100);
    expect(lista.some((u) => u.cnes === 'regulacao')).toBe(true);
    expect(lista.some((u) => u.cnes === 'outro')).toBe(true);
  });

  it('busca por número e bairro, ignorando acento e caixa', () => {
    const achadas = buscarUnidades('ubs 13 samambaia');
    expect(achadas.length).toBeGreaterThan(0);
    expect(achadas.every((u) => /samambaia/i.test(u.rotulo))).toBe(true);
  });

  it('"regulação" e "outro" caem direto nas entradas especiais, sem precisar digitar certinho', () => {
    expect(buscarUnidades('Regulação')).toEqual([expect.objectContaining({ cnes: 'regulacao' })]);
    expect(buscarUnidades('outro')).toEqual([expect.objectContaining({ cnes: 'outro' })]);
  });

  it('termo sem nenhuma unidade correspondente retorna lista vazia', () => {
    expect(buscarUnidades('xyzxyzxyz')).toEqual([]);
  });

  it('porCnes encontra uma unidade real pelo código', () => {
    const [primeira] = listarUnidades();
    expect(porCnes(primeira.cnes)).toEqual(primeira);
  });
});
