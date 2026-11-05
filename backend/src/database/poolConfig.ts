import type { PoolConfig } from 'pg';

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} deve ser inteiro positivo`);
  return parsed;
}

export function poolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  return {
    connectionString: env.DATABASE_URL,
    max: positiveInteger(env.DB_POOL_MAX, 10, 'DB_POOL_MAX'),
    connectionTimeoutMillis: positiveInteger(env.DB_CONNECT_TIMEOUT_MS, 5000, 'DB_CONNECT_TIMEOUT_MS'),
    idleTimeoutMillis: positiveInteger(env.DB_IDLE_TIMEOUT_MS, 30000, 'DB_IDLE_TIMEOUT_MS'),
    statement_timeout: positiveInteger(env.DB_STATEMENT_TIMEOUT_MS, 30000, 'DB_STATEMENT_TIMEOUT_MS'),
    application_name: 'petsaude-chatbot',
  };
}
