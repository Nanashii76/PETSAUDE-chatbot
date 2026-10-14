import type { Pool } from 'pg';

/** Provisionado pelo migrador; a API recebe somente acesso aos dados. */
export async function configureAppRole(pool: Pool, password: string): Promise<void> {
  if (password.length < 16) throw new Error('APP_DB_PASSWORD deve ter pelo menos 16 caracteres');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(918273646)');
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'petsaude_app') THEN
        CREATE ROLE petsaude_app LOGIN;
      END IF;
    END $$`);
    // format(%L) faz quoting SQL do segredo; não registrar este comando em logs da aplicação.
    const command = await client.query("SELECT format('ALTER ROLE petsaude_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text) AS sql", [password]);
    await client.query(command.rows[0].sql);
    await client.query('GRANT USAGE ON SCHEMA public TO petsaude_app');
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON
      sessoes, mensagens, encaminhamentos, interlocutores, eventos TO petsaude_app`);
    await client.query('GRANT SELECT ON documentos_rag TO petsaude_app');
    await client.query('GRANT EXECUTE ON FUNCTION match_documentos(vector, varchar, int) TO petsaude_app');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
