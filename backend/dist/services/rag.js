import { createClient } from '@supabase/supabase-js';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';
dotenv.config();
// Inicializa as chaves
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';
if (!supabaseUrl || !supabaseKey) {
    console.warn("[RAG] SUPABASE_URL ou SUPABASE_ANON_KEY não estão configurados. A busca vetorial pode falhar.");
}
if (!openaiApiKey) {
    console.warn("[RAG] OPENAI_API_KEY não configurada. A geração de embeddings falhará.");
}
// Cria o cliente Supabase
export const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : null;
/**
 * Realiza a busca vetorial (RAG) no Supabase baseado na query do usuário.
 * Retorna os textos das Notas Técnicas recuperadas.
 */
export async function buscarContexto(query, limite = 3) {
    try {
        if (!supabase) {
            console.error("[RAG] Cliente Supabase não inicializado.");
            return "";
        }
        const vectorStore = new SupabaseVectorStore(new OpenAIEmbeddings({
            openAIApiKey: openaiApiKey,
            modelName: 'text-embedding-3-small', // Modelo padrão para 1536 dimensões
        }), {
            client: supabase,
            tableName: "documentos_rag",
            queryName: "match_documentos", // Função RPC padrão que o supabase usa/precisa para buscar. Se não existir, a query direta (pgvector) seria necessária.
        });
        // Faz a busca de similaridade
        const results = await vectorStore.similaritySearch(query, limite);
        if (results.length === 0) {
            return "";
        }
        // Combina os resultados encontrados
        const contexto = results.map(doc => doc.pageContent).join('\n\n');
        console.log(`[RAG] Recuperados ${results.length} trechos relevantes.`);
        return contexto;
    }
    catch (error) {
        console.error("[RAG] Erro ao buscar contexto no banco vetorial:", error);
        return ""; // Em caso de erro, continua a execução sem o contexto
    }
}
