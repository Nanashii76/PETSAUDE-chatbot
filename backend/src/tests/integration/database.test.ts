import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { migrate } from '../../database/migrate.js';

const url = process.env.TEST_DATABASE_URL;
// Este teste apaga apenas schemas de um banco explicitamente dedicado a testes.
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL deve apontar para um banco terminado em _test');
process.env.DATABASE_URL = url;
const admin = new Pool({ connectionString: url });
const db = await import('../../services/database.js');
const { pool } = await import('../../services/pool.js');
const vector = `[${[1, ...Array(767).fill(0)].join(',')}]`;
async function reset() {
  await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
}
beforeAll(async () => { await reset(); await migrate(admin); });
afterAll(async () => { await pool.end(); await admin.end(); });

describe('PostgreSQL 16 + pgvector real', () => {
  it('bootstrap é repetível e valida checksums', async () => {
    await Promise.all([migrate(admin), migrate(admin)]);
    expect((await admin.query('SELECT * FROM schema_migrations')).rowCount).toBe(2);
    await admin.query("UPDATE schema_migrations SET checksum = 'alterado' WHERE version = '002_integridade_indices.sql'");
    await expect(migrate(admin)).rejects.toThrow('Migração alterada');
    const { checksum } = await import('../../database/migrate.js');
    const sql = await readFile(new URL('../../database/migrations/002_integridade_indices.sql', import.meta.url), 'utf8');
    await admin.query("UPDATE schema_migrations SET checksum = $1 WHERE version = '002_integridade_indices.sql'", [checksum(sql)]);
  });
  it('criação concorrente gera uma identidade, uma sessão e um único marcador nova', async () => {
    const profiles = await Promise.all(Array.from({ length: 20 }, () => db.buscarOuCriarInterlocutor('web', 'concorrente')));
    expect(new Set(profiles.map(p => p.id)).size).toBe(1);
    const sessions = await Promise.all(Array.from({ length: 20 }, () => db.buscarOuCriarSessao('concorrente')));
    expect(new Set(sessions.map(s => s.id)).size).toBe(1);
    expect(sessions.filter(s => s.nova)).toHaveLength(1);
    expect(sessions[0].interlocutor_id).toBe(profiles[0].id);
    await expect(admin.query("INSERT INTO sessoes(profissional_id) VALUES ('concorrente')")).rejects.toMatchObject({ code: '23505' });
  });
  it('isola canais e consulta encaminhamentos sem duplicar ou trocar o perfil', async () => {
    await db.atualizarInterlocutor('web', 'mesmo-id', { nome: 'Web' });
    await db.atualizarInterlocutor('whatsapp', 'mesmo-id', { nome: 'WhatsApp' });
    const web = await db.buscarOuCriarSessao('mesmo-id', 'web');
    const whatsapp = await db.buscarOuCriarSessao('mesmo-id', 'whatsapp');
    expect(web.id).not.toBe(whatsapp.id);
    await db.salvarEncaminhamento(whatsapp.id, 'cardiologia', null, 'resumo', {}, true);
    const rows = await db.buscarEncaminhamentosRecentes(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].profissional_nome).toBe('WhatsApp');
    await db.encerrarSessaoAtiva('mesmo-id');
    expect((await db.buscarOuCriarSessao('mesmo-id')).id).not.toBe(web.id);
    expect((await db.buscarOuCriarSessao('mesmo-id', 'whatsapp')).id).toBe(whatsapp.id);
  });
  it('vincula perfil cadastrado depois de uma sessão histórica sem identidade', async () => {
    const session = await db.buscarOuCriarSessao('perfil-tardio');
    expect(session.interlocutor_id).toBeNull();
    const profile = await db.buscarOuCriarInterlocutor('web', 'perfil-tardio');
    const resumed = await db.buscarOuCriarSessao('perfil-tardio');
    expect(resumed.id).toBe(session.id);
    expect(resumed.interlocutor_id).toBe(profile.id);
    expect(resumed.nova).toBeUndefined();
  });
  it('persiste mensagens, estado e métricas; rejeita dados inválidos e órfãos', async () => {
    const s = await db.buscarOuCriarSessao('historia');
    await db.salvarMensagem(s.id, 'profissional', 'relato', undefined, 0, 0);
    expect(await db.buscarMensagensProfissional(s.id)).toBe('relato');
    await expect(db.salvarMensagem(s.id, 'bot', 'inválido', undefined, -1)).rejects.toMatchObject({ code: '23514' });
    await expect(db.salvarMensagem('00000000-0000-0000-0000-000000000000', 'bot', 'órfão')).rejects.toMatchObject({ code: '23503' });
    await expect(db.atualizarSessao(s.id, 'INVALIDO', {}, [], 'orquestrador')).rejects.toMatchObject({ code: '23514' });
    const updated = await db.atualizarSessao(s.id, 'FINALIZADO', { teste: true }, [], 'cardiologia');
    expect(updated.atualizado_em.getTime()).toBeGreaterThanOrEqual(s.atualizado_em.getTime());
    await db.registrarEvento('texto_gerado', 'cardiologia', s.id, null);
    expect(await db.buscarEventosParaPainel(new Date(0))).toHaveLength(1);
    await admin.query('DELETE FROM sessoes WHERE id = $1', [s.id]);
    expect((await admin.query('SELECT * FROM mensagens WHERE sessao_id = $1', [s.id])).rowCount).toBe(0);
    expect((await admin.query('SELECT sessao_id FROM eventos')).rows[0].sessao_id).toBeNull();
  });
  it('busca vetorial respeita especialidade, limite e contrato dos campos mínimos', async () => {
    for (const specialty of ['cardiologia', 'dermatologia']) {
      await admin.query(`INSERT INTO documentos_rag(especialidade,titulo,conteudo,campos_minimos,embedding)
        VALUES ($1::varchar,$1::text,'conteudo','["sintomas"]',$2)`, [specialty, vector]);
    }
    const result = await admin.query('SELECT * FROM match_documentos($1,$2,$3)', [vector, 'cardiologia', 1]);
    expect(result.rows).toEqual([{ titulo: 'cardiologia', conteudo: 'conteudo', campos_minimos: ['sintomas'], similarity: 1 }]);
    expect((await admin.query('SELECT * FROM match_documentos($1,$2,0)', [vector, 'cardiologia'])).rowCount).toBe(0);
    expect((await admin.query('SELECT * FROM match_documentos($1,$2,4)', [vector, 'ausente'])).rowCount).toBe(0);
  });
  it('a API não tem privilégios de DDL nem de escrita na base RAG', async () => {
    const { configureAppRole } = await import('../../database/appRole.js');
    await configureAppRole(admin, 'test-app-password-only');
    const appUrl = new URL(url!);
    appUrl.username = 'petsaude_app'; appUrl.password = 'test-app-password-only';
    const app = new Pool({ connectionString: appUrl.toString() });
    try {
      await app.query("INSERT INTO sessoes(profissional_id) VALUES ('role-test')");
      await app.query('SELECT * FROM match_documentos($1,$2,1)', [vector, 'cardiologia']);
      await expect(app.query('DROP TABLE sessoes CASCADE')).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('DELETE FROM documentos_rag')).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('SELECT * FROM schema_migrations')).rejects.toMatchObject({ code: '42501' });
    } finally { await app.end(); }
  });
  it('adoção do schema antigo preserva dados e embeddings e reverte conflitos sem apagar casos', async () => {
    await reset();
    const baseline = await readFile(new URL('../../database/migrations/001_baseline.sql', import.meta.url), 'utf8');
    await admin.query(baseline);
    await admin.query("INSERT INTO sessoes(profissional_id) VALUES ('duplicada'),('duplicada')");
    await admin.query("INSERT INTO documentos_rag(especialidade,titulo,conteudo,embedding) VALUES ('cardiologia','original','original',$1)", [vector]);
    await expect(migrate(admin)).rejects.toThrow('Schema existente');
    await expect(migrate(admin, true)).rejects.toMatchObject({ code: '23505' });
    expect((await admin.query('SELECT * FROM sessoes')).rowCount).toBe(2);
    expect((await admin.query("SELECT * FROM information_schema.columns WHERE table_name='sessoes' AND column_name='canal'")).rowCount).toBe(0);
    await admin.query("UPDATE sessoes SET status='ABANDONADA' WHERE id=(SELECT id FROM sessoes LIMIT 1)");
    await admin.query("INSERT INTO interlocutores(canal,identificador) VALUES ('whatsapp','duplicada')");
    await migrate(admin, true);
    expect((await admin.query('SELECT * FROM sessoes')).rows.every(s => s.canal === 'whatsapp' && s.interlocutor_id)).toBe(true);
    expect((await admin.query('SELECT titulo, vector_dims(embedding) AS dimensions FROM documentos_rag')).rows).toEqual([{ titulo: 'original', dimensions: 768 }]);
    await migrate(admin);
  });
});
