import 'dotenv/config';
import { Pool } from 'pg';
import { configureAppRole } from '../database/appRole.js';
import { migrate } from '../database/migrate.js';

// DDL tem duração diferente das consultas HTTP; não herda statement_timeout do serviço.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
try {
  await migrate(pool, process.env.DB_BASELINE_EXISTING === 'true');
  if (process.env.APP_DB_PASSWORD) await configureAppRole(pool, process.env.APP_DB_PASSWORD);
  console.log('[Banco] Migrações aplicadas.');
} catch (error) {
  console.error('[Banco] Migração falhou:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
