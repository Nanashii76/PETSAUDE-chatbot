// src/services/evolution.ts
import dotenv from 'dotenv';
dotenv.config();

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;   // ex: https://seu-vps.com ou http://IP:8080
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;   // apikey global ou da instância
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE; // nome da instância que você criou

/**
 * Envia uma mensagem de texto via Evolution API para um número do WhatsApp.
 * @param numero Número no formato DDI+DDD+numero, ex: "5561999999999" (sem "+", sem espaços)
 * @param texto Texto da mensagem a ser enviada
 */
export async function enviarMensagemWhatsapp(numero: string, texto: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    throw new Error(
      "Variáveis EVOLUTION_API_URL, EVOLUTION_API_KEY ou EVOLUTION_INSTANCE não configuradas no .env"
    );
  }

  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: numero,
        text: texto
      })
    });

    if (!response.ok) {
      const erroBody = await response.text();
      console.error(`[Evolution] Falha ao enviar mensagem (Status: ${response.status}):`, erroBody);
      throw new Error(`Falha ao enviar mensagem via Evolution API: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Evolution] Mensagem enviada com sucesso para ${numero}`);
    return data;

  } catch (error) {
    console.error(`[Evolution] Erro ao chamar a Evolution API:`, error);
    throw error;
  }
}

/**
 * Extrai o texto e o remetente de um payload de webhook da Evolution API
 * (evento messages.upsert). Retorna null se não for uma mensagem de texto válida
 * ou se for uma mensagem enviada pelo próprio bot (fromMe).
 */
export function extrairMensagemDoWebhookEvolution(payload: any): { remetenteId: string; mensagem: string } | null {
  try {
    const data = payload?.data;
    if (!data) return null;

    // Ignora mensagens enviadas pelo próprio número conectado (eco do bot)
    if (data.key?.fromMe) return null;

    const remetenteId = data.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const mensagem =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      null;

    if (!remetenteId || !mensagem) return null;

    return { remetenteId, mensagem };
  } catch (error) {
    console.error('[Evolution] Erro ao extrair mensagem do payload:', error);
    return null;
  }
}