import { Router, type Request, type Response } from 'express';
import { encerrarSessaoAtiva } from '../services/database.js';

const router = Router();

// Chamado pelo botão "Nova triagem" do front — tanto ao clicar manualmente quanto logo após um
// caso finalizar — para garantir que a próxima mensagem comece do zero. Idempotente: se não houver
// sessão PENDENTE (ex: o caso já tinha finalizado), simplesmente não faz nada.
router.post('/sessao/nova', async (req: Request, res: Response): Promise<any> => {
  try {
    const { remetente_id } = req.body;

    if (!remetente_id) {
      return res.status(400).json({
        success: false,
        error: "O campo 'remetente_id' é obrigatório.",
      });
    }

    await encerrarSessaoAtiva(remetente_id);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Sessão] Erro ao iniciar nova triagem:', error);
    return res.status(500).json({ success: false, error: 'Falha ao iniciar nova triagem.' });
  }
});

export default router;
