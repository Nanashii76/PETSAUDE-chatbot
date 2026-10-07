import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// console.log('DB URL:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ==========================================
// 1. GERENCIAMENTO DE SESSÕES
// ==========================================

export async function buscarOuCriarSessao(profissionalId: string) {
  const client = await pool.connect();
  try {
    // Tenta encontrar uma sessão ativa (PENDENTE)
    const result = await client.query(
      `SELECT * FROM sessoes WHERE profissional_id = $1 AND status = 'PENDENTE' LIMIT 1`,
      [profissionalId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Se não achar, cria uma nova — marcada com "nova: true" (campo só em memória, não vai pro
    // banco) pro orquestrador saber que é a 1ª mensagem do caso e registrar o evento caso_iniciado.
    const insertResult = await client.query(
      `INSERT INTO sessoes (profissional_id) VALUES ($1) RETURNING *`,
      [profissionalId]
    );
    return { ...insertResult.rows[0], nova: true };
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
        tokensPrompt || null, 
        tokensResposta || null, 
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
    const existente = await client.query(
      `SELECT * FROM interlocutores WHERE canal = $1 AND identificador = $2 LIMIT 1`,
      [canal, identificador]
    );
    if (existente.rows.length > 0) {
      return existente.rows[0];
    }
    const criado = await client.query(
      `INSERT INTO interlocutores (canal, identificador) VALUES ($1, $2) RETURNING *`,
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
// 6. REVISÃO DO TEXTO FINAL (COMPARADOR)
// ==========================================

// Concatena o relato livre do profissional na sessão — usado pra comparar com o texto final gerado
// pelo modelo antes do profissional confirmar/copiar.
export async function buscarMensagensProfissional(sessaoId: string): Promise<string> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT conteudo FROM mensagens WHERE sessao_id = $1 AND remetente = 'profissional' ORDER BY criado_em ASC`,
      [sessaoId]
    );
    return result.rows.map((r) => r.conteudo).join('\n\n');
  } finally {
    client.release();
  }
}