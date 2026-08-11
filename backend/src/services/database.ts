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

    // Se não achar, cria uma nova
    const insertResult = await client.query(
      `INSERT INTO sessoes (profissional_id) VALUES ($1) RETURNING *`,
      [profissionalId]
    );
    return insertResult.rows[0];
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

export async function buscarHistoricoSessao(sessaoId: string) {
  const client = await pool.connect();
  try {
    // Busca as mensagens em ordem cronológica para passar como contexto pro LLM
    const result = await client.query(
      `SELECT remetente, conteudo FROM mensagens WHERE sessao_id = $1 ORDER BY criado_em ASC`,
      [sessaoId]
    );
    return result.rows;
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