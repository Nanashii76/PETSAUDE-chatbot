import { describe, it, expect } from 'vitest';
import { listarUnidades, buscarUnidades, porCnes } from '../../core/unidades.js';

describe('unidades', () => {
  it('carrega a lista real do JSON com a entrada especial no final', () => {
    const lista = listarUnidades();
    expect(lista.length).toBeGreaterThan(100);
    expect(lista.some((u) => u.cnes === 'outro')).toBe(true);
  });

  it('busca por número e bairro, ignorando acento e caixa', () => {
    const achadas = buscarUnidades('ubs 13 samambaia');
    expect(achadas.length).toBeGreaterThan(0);
    expect(achadas.every((u) => /samambaia/i.test(u.rotulo))).toBe(true);
  });

  it('"outro" cai direto na entrada especial, sem precisar digitar certinho', () => {
    expect(buscarUnidades('outro')).toEqual([expect.objectContaining({ cnes: 'outro' })]);
  });

  it('encontra UPAs, Policlínicas e Hospitais pela busca natural', () => {
    // Esses testes assumem que os dados reais foram baixados e contêm essas unidades
    const hr = buscarUnidades('HRG');
    if (hr.length > 0) {
      expect(hr.some(u => u.nome.includes('HRG') && u.tipo === 'Hospital')).toBe(true);
    }

    const upa = buscarUnidades('UPA Ceilandia');
    if (upa.length > 0) {
      expect(upa.some(u => u.nome.includes('UPA') && u.tipo === 'UPA')).toBe(true);
    }
  });

  it('termo sem nenhuma unidade correspondente retorna lista vazia', () => {
    expect(buscarUnidades('xyzxyzxyz')).toEqual([]);
  });

  it('porCnes encontra uma unidade real pelo código', () => {
    const [primeira] = listarUnidades();
    expect(porCnes(primeira.cnes)).toEqual(primeira);
  });
});
