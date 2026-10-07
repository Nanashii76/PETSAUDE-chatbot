import { Router, type Request, type Response } from 'express';
import { buscarOuCriarSessao, salvarMensagem, atualizarSessao } from '../services/database.js';
import { processarMensagemRegulacao } from '../core/regulacao.js';

const router = Router();

// Sessão separada da de encaminhamento do mesmo profissional — mesmo mecanismo de
// buscarOuCriarSessao/atualizarSessao, só com o identificador namespaced, sem precisar de coluna
// nova no schema.
function idSessaoRegulacao(remetenteId: string): string {
  return `${remetenteId}::regulacao`;
}

router.post('/regulacao/mensagem', async (req: Request, res: Response): Promise<any> => {
  try {
    const { remetente_id, mensagem } = req.body;

    if (!remetente_id || !mensagem) {
      return res.status(400).json({
        success: false,
        error: "Os campos 'remetente_id' e 'mensagem' são obrigatórios no payload JSON.",
      });
    }

    const sessao = await buscarOuCriarSessao(idSessaoRegulacao(remetente_id));
    await salvarMensagem(sessao.id, 'profissional', mensagem);

    const resultado = await processarMensagemRegulacao(sessao, mensagem);

    await salvarMensagem(
      sessao.id,
      'bot',
      resultado.texto_resposta,
      resultado.telemetria.modelo_usado,
      resultado.telemetria.tokens_prompt,
      resultado.telemetria.tokens_resposta
    );
    await atualizarSessao(sessao.id, 'PENDENTE', resultado.dados_coletados, [], 'regulacao');

    return res.status(200).json({
      success: true,
      reply: resultado.texto_resposta,
      opcoes: resultado.opcoes,
      copiavel: resultado.copiavel,
    });
  } catch (error) {
    console.error('[Regulação] Erro crítico:', error);
    return res.status(500).json({
      success: false,
      reply: 'O sistema de regulação está passando por instabilidades técnicas. Tente novamente em alguns minutos.',
    });
  }
});

export default router;
