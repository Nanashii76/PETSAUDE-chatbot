import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/** Uma conexão + lock de sessão: dois deploys não aplicam a mesma migração. */
export async function migrate(pool: Pool, adoptExisting = false,
  directory = new URL('./migrations/', import.meta.url)): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(918273645)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(directory)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
    for (const file of files) {
      const sql = await readFile(new URL(file, directory), 'utf8');
      const hash = checksum(sql);
      const applied = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [file]);
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== hash) throw new Error(`Migração alterada após aplicação: ${file}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        const existing = file === '001_baseline.sql'
          ? await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'
              AND tablename = ANY($1::text[])`, [['sessoes', 'mensagens', 'encaminhamentos', 'documentos_rag', 'interlocutores', 'eventos']])
          : { rowCount: 0 };
        if (existing.rowCount) {
          if (!adoptExisting || existing.rowCount !== 6) {
            throw new Error('Schema existente: restaure o schema completo conhecido e use DB_BASELINE_EXISTING=true após conferência.');
          }
          const vector = await client.query(`SELECT format_type(atttypid, atttypmod) AS type
            FROM pg_attribute WHERE attrelid = 'documentos_rag'::regclass AND attname = 'embedding'`);
          if (vector.rows[0]?.type !== 'vector(768)') throw new Error('Embedding existente incompatível: esperado vector(768)');
          await client.query('SELECT campos_minimos FROM documentos_rag LIMIT 0');
          await client.query('SELECT * FROM match_documentos(NULL::vector, NULL::varchar, 0)');
        } else {
          await client.query(sql);
        }
        await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', [file, hash]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(918273645)'); }
    finally { client.release(); }
  }
}
