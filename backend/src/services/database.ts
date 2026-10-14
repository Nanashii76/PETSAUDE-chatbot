import { pool } from './pool.js';

// ==========================================
// 1. GERENCIAMENTO DE SESSÕES
// ==========================================

export async function buscarOuCriarSessao(profissionalId: string, canal: 'web' | 'whatsapp' = 'web') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializa apenas a criação/encerramento da mesma identidade. O índice único é a
    // garantia final, inclusive para escritores externos ao backend.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([canal, profissionalId])]);
    const existing = await client.query(
      `SELECT * FROM sessoes WHERE canal = $1 AND profissional_id = $2 AND status = 'PENDENTE'`,
      [canal, profissionalId]
    );
    if (existing.rowCount) {
      let sessao = existing.rows[0];
      // Um perfil pode ter sido cadastrado depois da sessão histórica.
      if (!sessao.interlocutor_id) {
        const linked = await client.query(
          `UPDATE sessoes s SET interlocutor_id = i.id FROM interlocutores i
           WHERE s.id = $1 AND i.canal = s.canal AND i.identificador = s.profissional_id
           RETURNING s.*`, [sessao.id]
        );
        sessao = linked.rows[0] ?? sessao;
      }
      await client.query('COMMIT');
      return sessao;
    }
    const result = await client.query(
      `INSERT INTO sessoes (profissional_id, canal, interlocutor_id)
       VALUES ($1::varchar, $2::varchar, (SELECT id FROM interlocutores WHERE canal = $2 AND identificador = $1)) RETURNING *`,
      [profissionalId, canal]
    );
    await client.query('COMMIT');
    return { ...result.rows[0], nova: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Chamado pelo botão "Nova triagem" do front: encerra a sessão PENDENTE do profissional, se houver
// uma em andamento. Sem isso, uma triagem abandonada no meio da coleta seria retomada em silêncio
// na próxima mensagem — buscarOuCriarSessao só abre uma sessão nova quando não encontra nenhuma
// PENDENTE. "ABANDONADA" é só mais um status terminal (como FINALIZADO/NAO_ELEGIVEL): não gera
// evento nem encaminhamento, porque nada foi de fato produzido nessa sessão.
export async function encerrarSessaoAtiva(profissionalId: string, canal: 'web' | 'whatsapp' = 'web'): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([canal, profissionalId])]);
    const result = await client.query(
      `UPDATE sessoes SET status = 'ABANDONADA'
       WHERE profissional_id = $1 AND canal = $2 AND status = 'PENDENTE' RETURNING id`,
      [profissionalId, canal]
    );
    await client.query('COMMIT');
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function atualizarSessao(
  sessaoId: string,
  status: string,
  dadosColetados: object,
  dadosPendentes: string[],
  agenteAtual: string // <-- Seu parâmetro está certinho aqui
) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      // Adicionamos o "agente_atual = $5" na instrução SQL
      `UPDATE sessoes
       SET status = $1,
           dados_coletados = $2,
           dados_pendentes = $3,
           agente_atual = $5,
           atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [
        status,
        JSON.stringify(dadosColetados),
        JSON.stringify(dadosPendentes),
        sessaoId,
        agenteAtual // <-- Repassando a variável para a posição $5 do SQL
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ==========================================
// 2. HISTÓRICO E TELEMETRIA
// ==========================================

export async function salvarMensagem(
  sessaoId: string,
  remetente: 'profissional' | 'bot' | 'system',
  conteudo: string,
  modeloUsado?: string,
  tokensPrompt?: number,
  tokensResposta?: number,
  fontesRag?: object
) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO mensagens
       (sessao_id, remetente, conteudo, modelo_usado, tokens_prompt, tokens_resposta, fontes_rag)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        sessaoId,
        remetente,
        conteudo,
        modeloUsado || null,
        tokensPrompt ?? null,
        tokensResposta ?? null,
        fontesRag ? JSON.stringify(fontesRag) : null
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ==========================================
// 3. ENCAMINHAMENTO FINAL
// ==========================================

export async function salvarEncaminhamento(
  sessaoId: string,
  especialidade: string,
  classificacaoRisco: string | null,
  resumoSisreg: string,
  dadosEstruturados: object,
  elegivel: boolean
) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO encaminhamentos
       (sessao_id, especialidade, classificacao_risco, resumo_sisreg, dados_estruturados, elegivel)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [sessaoId, especialidade, classificacaoRisco, resumoSisreg, JSON.stringify(dadosEstruturados), elegivel]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ==========================================
// 4. IDENTIDADE DO PROFISSIONAL (NOME E UNIDADE)
// ==========================================

export async function buscarOuCriarInterlocutor(canal: 'web' | 'whatsapp', identificador: string) {
  const client = await pool.connect();
  try {
    const criado = await client.query(
      `INSERT INTO interlocutores (canal, identificador) VALUES ($1, $2)
       ON CONFLICT (canal, identificador) DO UPDATE SET identificador = EXCLUDED.identificador
       RETURNING *`,
      [canal, identificador]
    );
    return criado.rows[0];
  } finally {
    client.release();
  }
}

export async function atualizarInterlocutor(
  canal: 'web' | 'whatsapp',
  identificador: string,
  dados: { nome?: string; unidade_cnes?: string }
) {
  await buscarOuCriarInterlocutor(canal, identificador);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE interlocutores
       SET nome = COALESCE($3, nome),
           unidade_cnes = COALESCE($4, unidade_cnes)
       WHERE canal = $1 AND identificador = $2 RETURNING *`,
      [canal, identificador, dados.nome ?? null, dados.unidade_cnes ?? null]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ==========================================
// 5. EVENTOS DE USO (PARA O PAINEL — SEM TEXTO DE CASO)
// ==========================================

export async function registrarEvento(
  tipo: 'caso_iniciado' | 'texto_gerado' | 'nao_elegivel' | 'urgencia',
  especialidade: string | null,
  sessaoId: string | null,
  interlocutorId: string | null,
  dados: object = {}
) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO eventos (tipo, especialidade, sessao_id, interlocutor_id, dados)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tipo, especialidade, sessaoId, interlocutorId, JSON.stringify(dados)]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export type LinhaPainel = {
  tipo: string;
  especialidade: string | null;
  dados: Record<string, any>;
  unidade_cnes: string | null;
  criado_em: Date;
};

// Junta eventos com a unidade do interlocutor (quando houver) — a agregação de verdade (contagens,
// agrupamentos) acontece em core/painel.ts; aqui só busca as linhas cruas do período.
export async function buscarEventosParaPainel(desde: Date | null): Promise<LinhaPainel[]> {
  const client = await pool.connect();
  try {
    const condicaoPeriodo = desde ? 'WHERE ev.criado_em >= $1' : '';
    const params = desde ? [desde] : [];
    const result = await client.query(
      `SELECT ev.tipo, ev.especialidade, ev.dados, ev.criado_em, i.unidade_cnes
       FROM eventos ev
       LEFT JOIN interlocutores i ON i.id = ev.interlocutor_id
       ${condicaoPeriodo}
       ORDER BY ev.criado_em ASC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// ==========================================
// 5b. ENCAMINHAMENTOS GERADOS (DRILL-DOWN DO PAINEL)
// ==========================================

export type LinhaEncaminhamentoLista = {
  id: string;
  sessao_id: string;
  especialidade: string;
  classificacao_risco: string | null;
  elegivel: boolean;
  criado_em: Date;
  unidade_cnes: string | null;
  profissional_nome: string | null;
};

// Lista leve (sem o texto do encaminhamento) para a tabela do painel — o texto completo só é
// buscado quando o regulador abre um item específico (buscarEncaminhamentoPorId).
export async function buscarEncaminhamentosRecentes(
  desde: Date | null,
  limite = 50
): Promise<LinhaEncaminhamentoLista[]> {
  const client = await pool.connect();
  try {
    const condicaoPeriodo = desde ? 'WHERE e.criado_em >= $2' : '';
    const params: any[] = desde ? [limite, desde] : [limite];
    const result = await client.query(
      `SELECT e.id, e.sessao_id, e.especialidade, e.classificacao_risco, e.elegivel, e.criado_em,
              i.unidade_cnes, i.nome AS profissional_nome
       FROM encaminhamentos e
       JOIN sessoes s ON s.id = e.sessao_id
       LEFT JOIN interlocutores i ON i.id = s.interlocutor_id
       ${condicaoPeriodo}
       ORDER BY e.criado_em DESC, e.id DESC
       LIMIT $1`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export type LinhaEncaminhamentoDetalhe = {
  id: string;
  sessao_id: string;
  especialidade: string;
  classificacao_risco: string | null;
  resumo_sisreg: string | null;
  elegivel: boolean;
  criado_em: Date;
};

export async function buscarEncaminhamentoPorId(id: string): Promise<LinhaEncaminhamentoDetalhe | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, sessao_id, especialidade, classificacao_risco, resumo_sisreg, elegivel, criado_em
       FROM encaminhamentos WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// ==========================================
// 6. REVISÃO DO TEXTO FINAL (COMPARADOR)
// ==========================================

// Concatena o relato livre do profissional na sessão — usado pra comparar com o texto final gerado
// pelo modelo antes do profissional confirmar/copiar.
export async function buscarMensagensProfissional(sessaoId: string): Promise<string> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT conteudo FROM mensagens WHERE sessao_id = $1 AND remetente = 'profissional' ORDER BY criado_em ASC, id ASC`,
      [sessaoId]
    );
    return result.rows.map((r) => r.conteudo).join('\n\n');
  } finally {
    client.release();
  }
}
