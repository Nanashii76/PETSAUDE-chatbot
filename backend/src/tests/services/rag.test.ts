import { describe, it, expect, vi, beforeEach } from 'vitest';

const { gerarEmbeddingMock, queryMock } = vi.hoisted(() => ({
  gerarEmbeddingMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../services/embeddings.js', () => ({
  gerarEmbedding: gerarEmbeddingMock,
}));

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(function PoolMock() {
    return { query: queryMock };
  }),
}));

const { buscarContexto } = await import('../../services/rag.js');

describe('buscarContexto', () => {
  beforeEach(() => {
    gerarEmbeddingMock.mockReset();
    queryMock.mockReset();
  });

  it('retorna vazio sem chamar gerarEmbedding/query quando a especialidade não tem RAG associado', async () => {
    const resultado = await buscarContexto('oi, bom dia', 'duvidas_gerais');

    expect(resultado).toEqual({ contexto: '', fontes: [] });
    expect(gerarEmbeddingMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('monta contexto e fontes a partir das linhas retornadas pela busca vetorial', async () => {
    gerarEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    queryMock.mockResolvedValue({
      rows: [
        { titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', conteudo: 'trecho 1', similarity: 0.9 },
        { titulo: 'Consulta em Cardiologia - Insuficiência Cardíaca', conteudo: 'trecho 2', similarity: 0.8 },
      ],
    });

    const resultado = await buscarContexto('hipertensão mal controlada', 'cardiologia');

    expect(gerarEmbeddingMock).toHaveBeenCalledWith('hipertensão mal controlada', 'query');
    expect(resultado.contexto).toBe('trecho 1\n\n---\n\ntrecho 2');
    expect(resultado.fontes).toEqual([
      { titulo: 'Consulta em Cardiologia - Hipertensão Arterial Sistêmica', similarity: 0.9 },
      { titulo: 'Consulta em Cardiologia - Insuficiência Cardíaca', similarity: 0.8 },
    ]);
  });

  it('retorna vazio quando a busca vetorial não encontra nenhum trecho', async () => {
    gerarEmbeddingMock.mockResolvedValue([0.1]);
    queryMock.mockResolvedValue({ rows: [] });

    const resultado = await buscarContexto('pergunta qualquer', 'dermatologia');
    expect(resultado).toEqual({ contexto: '', fontes: [] });
  });

  it('captura erro do banco/embedding e retorna vazio em vez de derrubar a conversa', async () => {
    gerarEmbeddingMock.mockResolvedValue([0.1]);
    queryMock.mockRejectedValue(new Error('conexão recusada'));

    const resultado = await buscarContexto('pergunta qualquer', 'endocrinologia');
    expect(resultado).toEqual({ contexto: '', fontes: [] });
  });
});
