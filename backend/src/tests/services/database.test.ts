import { beforeEach, describe, expect, it, vi } from 'vitest';
import { poolConfig } from '../../database/poolConfig.js';
import { checksum } from '../../database/migrate.js';
const { query, release } = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('../../services/pool.js', () => ({ pool: { connect: async () => ({ query, release }) } }));
import { buscarOuCriarSessao, salvarMensagem } from '../../services/database.js';

beforeEach(() => { vi.clearAllMocks(); });
describe('configuração do pool', () => {
  it('limita conexões e espera por padrão', () => {
    expect(poolConfig({})).toMatchObject({ max: 10, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  });
  it.each(['0', '-1', 'NaN', '1.5', 'Infinity', ''])('rejeita limite inválido %s', value => {
    expect(() => poolConfig({ DB_POOL_MAX: value })).toThrow('inteiro positivo');
  });
  it('aceita parâmetros explícitos', () => {
    expect(poolConfig({ DB_POOL_MAX: '3', DATABASE_URL: 'postgres://local/db' })).toMatchObject({ max: 3, connectionString: 'postgres://local/db' });
  });
});
it('checksum detecta alteração do SQL', () => {
  expect(checksum('SELECT 1')).toBe(checksum('SELECT 1'));
  expect(checksum('SELECT 1')).not.toBe(checksum('SELECT 2'));
});
it('faz rollback e libera conexão quando criação falha', async () => {
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  query.mockRejectedValueOnce(new Error('falha'));
  await expect(buscarOuCriarSessao('abc')).rejects.toThrow('falha');
  expect(query).toHaveBeenCalledWith('ROLLBACK');
  expect(release).toHaveBeenCalledTimes(1);
});
it('preserva contagem zero de tokens', async () => {
  query.mockResolvedValue({ rows: [{ id: 'mensagem' }] });
  await salvarMensagem('sessao', 'bot', 'resposta', 'modelo', 0, 0);
  expect(query.mock.calls[0][1]).toEqual(['sessao', 'bot', 'resposta', 'modelo', 0, 0, null]);
  expect(release).toHaveBeenCalledTimes(1);
});
