import { Router, type Request, type Response } from 'express';
import { buscarOuCriarSessao, salvarMensagem, atualizarSessao } from '../services/database.js';
import { processarMensagemLLM } from '../core/orchestrator.js'; // Será injetado na próxima etapa

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    // 1. Extração e Validação do Payload
    // Ajuste estas chaves conforme o formato exato enviado pelo seu frontend/Evolution API
    const { remetente_id, mensagem, origem } = req.body;

    if (!remetente_id || !mensagem) {
      return res.status(400).json({ 
        success: false, 
        error: "Os campos 'remetente_id' e 'mensagem' são obrigatórios no payload JSON." 
      });
    }

    console.log(`[Webhook] Mensagem recebida de ${remetente_id}: ${mensagem}`);

    // 2. Gerenciamento de Estado
    const sessao = await buscarOuCriarSessao(remetente_id);

    // 3. Auditoria: Salva a mensagem recebida no PostgreSQL
    await salvarMensagem(sessao.id, 'profissional', mensagem);

    // ==========================================
    // 4. INTEGRAÇÃO COM A INTELIGÊNCIA ARTIFICIAL
    // ==========================================
    
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

export default router;