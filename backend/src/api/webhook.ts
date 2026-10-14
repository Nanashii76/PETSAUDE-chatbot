import { Router, type Request, type Response } from 'express';
import {
  buscarOuCriarSessao,
  salvarMensagem,
  atualizarSessao,
  buscarOuCriarInterlocutor,
  atualizarInterlocutor,
  buscarMensagensProfissional,
} from '../services/database.js';
import { processarMensagemLLM } from '../core/orchestrator.js'; // Será injetado na próxima etapa
import { enviarMensagemWhatsapp, extrairMensagemDoWebhookEvolution } from '../services/evolution.js';

const router = Router();

/**
 * Lógica central compartilhada por qualquer canal de entrada (front, celular, WhatsApp):
 * busca/cria sessão, salva a mensagem recebida, chama a IA, salva a resposta e
 * atualiza o estado da sessão. Retorna o objeto de resposta da IA.
 */
async function processarEAuditar(canal: 'web' | 'whatsapp', remetenteId: string, mensagem: string) {
  // 2. Gerenciamento de Estado
  // Resolve o interlocutor para anexar aos eventos do painel (fase 3) — no canal web, a tela de
  // identificação já deve ter criado esse registro antes da 1ª mensagem; a busca aqui só confirma.
  const interlocutor = await buscarOuCriarInterlocutor(canal, remetenteId);
  const sessao = await buscarOuCriarSessao(remetenteId, canal);

  // 3. Auditoria: Salva a mensagem recebida no PostgreSQL
  await salvarMensagem(sessao.id, 'profissional', mensagem);

  // 4. INTEGRAÇÃO COM A INTELIGÊNCIA ARTIFICIAL
  const respostaIA = await processarMensagemLLM(sessao, mensagem, interlocutor.id);

  // 5. Auditoria: Salva a resposta gerada (incluindo quais trechos da Nota Técnica
  // fundamentaram a resposta, para rastreabilidade)
  await salvarMensagem(
    sessao.id,
    'bot',
    respostaIA.texto_resposta,
    respostaIA.telemetria.modelo_usado,
    respostaIA.telemetria.tokens_prompt,
    respostaIA.telemetria.tokens_resposta,
    respostaIA.fontes_rag?.length ? { fontes: respostaIA.fontes_rag } : undefined
  );

  // Salva o novo estado da sessão no banco
  await atualizarSessao(
    sessao.id,
    respostaIA.novo_status,
    respostaIA.dados_coletados,
    respostaIA.dados_pendentes,
    respostaIA.agente_atual
  );

  // Caso fechou de verdade: busca o relato original do profissional para o comparador do front
  // (botão "Revisar e confirmar") — concatenação das mensagens dele nesta sessão, sem reprocessar nada.
  const relatoProfissional =
    respostaIA.novo_status === 'FINALIZADO' ? await buscarMensagensProfissional(sessao.id) : null;

  return { ...respostaIA, relato_profissional: relatoProfissional };
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

    const respostaIA = await processarEAuditar('web', remetente_id, mensagem);

    // 6. Retorno Limpo para a Aplicação Cliente — status, cor_risco e relato_profissional só vêm
    // preenchidos quando o caso fecha (FINALIZADO), para o front mostrar o selo de risco e montar o
    // comparador "Revisar e confirmar". "opcoes" vem preenchido nos pontos em que o código decide
    // mostrar botões de resposta rápida (cor de risco, confirmação antes de finalizar).
    return res.status(200).json({
      success: true,
      reply: respostaIA.texto_resposta,
      status: respostaIA.novo_status,
      cor_risco: respostaIA.cor_risco,
      relato_profissional: respostaIA.relato_profissional,
      opcoes: respostaIA.opcoes || []
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

    const { remetenteId, mensagem, nomeContato } = mensagemExtraida;
    console.log(`[Webhook Evolution] Mensagem recebida de ${remetenteId}: ${mensagem}`);

    // Nome capturado automaticamente do contato do WhatsApp — sem perguntar, diferente do fluxo
    // web. Só grava na primeira vez (não sobrescreve um nome já registrado).
    const interlocutor = await buscarOuCriarInterlocutor('whatsapp', remetenteId);
    if (nomeContato && !interlocutor.nome) {
      await atualizarInterlocutor('whatsapp', remetenteId, { nome: nomeContato });
    }

    const respostaIA = await processarEAuditar('whatsapp', remetenteId, mensagem);

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