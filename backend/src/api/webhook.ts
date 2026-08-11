import { Router, type Request, type Response } from 'express';
import { buscarOuCriarSessao, salvarMensagem, atualizarSessao } from '../services/database.js';
import { processarMensagemLLM } from '../core/orchestrator.js'; // Será injetado na próxima etapa
import { enviarMensagemWhatsapp, extrairMensagemDoWebhookEvolution } from '../services/evolution.js';

const router = Router();

/**
 * Lógica central compartilhada por qualquer canal de entrada (front, celular, WhatsApp):
 * busca/cria sessão, salva a mensagem recebida, chama a IA, salva a resposta e
 * atualiza o estado da sessão. Retorna o objeto de resposta da IA.
 */
async function processarEAuditar(remetenteId: string, mensagem: string) {
  // 2. Gerenciamento de Estado
  const sessao = await buscarOuCriarSessao(remetenteId);

  // 3. Auditoria: Salva a mensagem recebida no PostgreSQL
  await salvarMensagem(sessao.id, 'profissional', mensagem);

  // 4. INTEGRAÇÃO COM A INTELIGÊNCIA ARTIFICIAL
  const respostaIA = await processarMensagemLLM(sessao, mensagem);

  // 5. Auditoria: Salva a resposta gerada
  await salvarMensagem(
    sessao.id,
    'bot',
    respostaIA.texto_resposta,
    respostaIA.telemetria.modelo_usado,
    respostaIA.telemetria.tokens_prompt,
    respostaIA.telemetria.tokens_resposta
  );

  // Salva o novo estado da sessão no banco
  await atualizarSessao(
    sessao.id,
    respostaIA.novo_status,
    respostaIA.dados_coletados,
    respostaIA.dados_pendentes,
    respostaIA.agente_atual
  );

  return respostaIA;
}

router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    // 1. Extração e Validação do Payload
    // Ajuste estas chaves conforme o formato exato enviado pelo seu frontend
    const { remetente_id, mensagem } = req.body;

    if (!remetente_id || !mensagem) {
      return res.status(400).json({ 
        success: false, 
        error: "Os campos 'remetente_id' e 'mensagem' são obrigatórios no payload JSON." 
      });
    }

    console.log(`[Webhook] Mensagem recebida de ${remetente_id}: ${mensagem}`);

    const respostaIA = await processarEAuditar(remetente_id, mensagem);

    // 6. Retorno Limpo para a Aplicação Cliente
    return res.status(200).json({ 
      success: true, 
      reply: respostaIA.texto_resposta
    });

  } catch (error) {
    console.error('[Erro Crítico no Webhook]:', error);
    
    // Fallback de segurança garantindo que a ponta cliente não fique aguardando eternamente
    return res.status(500).json({ 
      success: false, 
      reply: "Prezado(a) profissional, o sistema de regulação está passando por instabilidades técnicas. Tente novamente em alguns minutos." 
    });
  }
});

// ==========================================
// ROTA DEDICADA PARA A EVOLUTION API (WHATSAPP)
// ==========================================
router.post('/evolution', async (req: Request, res: Response): Promise<any> => {
  try {
    // A Evolution manda vários tipos de evento (conexão, presença, etc.) — só nos
    // interessa messages.upsert com uma mensagem de texto real de um usuário.
    const mensagemExtraida = extrairMensagemDoWebhookEvolution(req.body);

    if (!mensagemExtraida) {
      // Não é uma mensagem de texto válida (pode ser eco do bot, mídia, evento de sistema etc.)
      // Respondemos 200 mesmo assim para a Evolution não ficar reenviando o evento.
      return res.status(200).json({ success: true, ignored: true });
    }

    const { remetenteId, mensagem } = mensagemExtraida;
    console.log(`[Webhook Evolution] Mensagem recebida de ${remetenteId}: ${mensagem}`);

    const respostaIA = await processarEAuditar(remetenteId, mensagem);

    // Diferente da rota '/', aqui a resposta não vai no corpo do HTTP:
    // ela precisa ser enviada de volta ao usuário via chamada à própria Evolution API.
    await enviarMensagemWhatsapp(remetenteId, respostaIA.texto_resposta);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[Erro Crítico no Webhook Evolution]:', error);

    // Mesmo em erro, respondemos 200 para a Evolution não reenviar o mesmo evento
    // em loop. O erro já foi logado para investigação.
    return res.status(200).json({ success: false });
  }
});

export default router;