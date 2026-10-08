import { describe, it, expect } from 'vitest';
import { valorVazio, limparDadosColetados } from '../../core/dadosColetados.js';

describe('valorVazio', () => {
  it('considera vazio: null, undefined, string em branco, "null" e "undefined" literais', () => {
    expect(valorVazio(null)).toBe(true);
    expect(valorVazio(undefined)).toBe(true);
    expect(valorVazio('')).toBe(true);
    expect(valorVazio('   ')).toBe(true);
    expect(valorVazio('null')).toBe(true);
    expect(valorVazio('UNDEFINED')).toBe(true);
    expect(valorVazio([])).toBe(true);
    expect(valorVazio({})).toBe(true);
  });

  it('não considera vazio: valores reais, incluindo 0 e false', () => {
    expect(valorVazio(0)).toBe(false);
    expect(valorVazio(false)).toBe(false);
    expect(valorVazio('Amarela')).toBe(false);
    expect(valorVazio(['Sinais e sintomas'])).toBe(false);
    expect(valorVazio({ idade: 62 })).toBe(false);
  });
});

describe('limparDadosColetados', () => {
  it('remove chaves de dados com valor vazio, preservando as demais', () => {
    const limpo = limparDadosColetados({
      idade: 62,
      diagnostico: 'Angina estável',
      exames: null,
      medicacoes: '',
      tratamento_previo: 'undefined',
    });

    expect(limpo).toEqual({ idade: 62, diagnostico: 'Angina estável' });
  });

  it('nunca remove chaves internas ("_"), mesmo com valor vazio/falso', () => {
    const limpo = limparDadosColetados({
      _aguardando_cor: true,
      _cor_final_pendente: null,
      idade: null,
    });

    expect(limpo).toEqual({ _aguardando_cor: true, _cor_final_pendente: null });
  });
});
