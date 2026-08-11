import { createClient } from '@supabase/supabase-js';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

// Inicializa as chaves (Prioriza a Service Role Key para leitura interna dos vetores)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("[RAG] SUPABASE_URL ou Chave Supabase não estão configurados. A busca vetorial pode falhar.");
}

if (!openaiApiKey) {
  console.warn("[RAG] OPENAI_API_KEY não configurada. A geração de embeddings falhará.");
}

// Cria o cliente Supabase
export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

/**
 * Realiza a busca vetorial (RAG) no Supabase baseado na query do usuário e no agente.
 * Retorna os textos das Notas Técnicas recuperadas.
 */
export async function buscarContexto(query: string, agenteAtual: string, limite = 3): Promise<string> {
  try {
    if (!supabase) {
      console.error("[RAG] Cliente Supabase não inicializado.");
      return "";
    }

    let tableName = "";
    let queryName = "";

    // Mapeamento correto e completo das tabelas e funções RPC criadas pelo n8n/SQL
    if (agenteAtual === 'cardiologia') {
      tableName = "notes_cardi";
      queryName = "match_notes_cardi";
    } else if (agenteAtual === 'endocrinologia') {
      tableName = "notes_endocri";
      queryName = "match_notes_endocri";
    } else if (agenteAtual === 'dermatologia') {
      tableName = "notes_derma";
      queryName = "match_notes_derma";
    } else {
      // Retorna vazio imediatamente se for orquestrador ou dúvidas gerais (evita erro de tabela não encontrada)
      return "";
    }

    const vectorStore = new SupabaseVectorStore(
      new OpenAIEmbeddings({
        openAIApiKey: openaiApiKey,
        modelName: 'text-embedding-3-small', // Modelo padrão leve e eficiente
      }),
      {
        client: supabase,
        tableName: tableName,
        queryName: queryName,
      }
    );

    // Faz a busca de similaridade
    const results = await vectorStore.similaritySearch(query, limite);
    
    if (results.length === 0) {
      return "";
    }

    // Combina os resultados encontrados com divisórias claras para a IA entender melhor
    const contexto = results.map(doc => doc.pageContent).join('\n\n---\n\n');
    console.log(`[RAG] Recuperados ${results.length} trechos relevantes da tabela ${tableName}.`);
    
    return contexto;
  } catch (error) {
    console.error(`[RAG] Erro ao buscar contexto no banco vetorial para ${agenteAtual}:`, error);
    return ""; // Em caso de erro (ex: banco caiu), continua a execução sem o contexto
  }
}