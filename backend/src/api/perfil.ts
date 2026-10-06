import { Router, type Request, type Response } from 'express';
import { listarUnidades } from '../core/unidades.js';
import { atualizarInterlocutor } from '../services/database.js';

const router = Router();

// Lista completa (poucas centenas de itens) — a busca/filtro acontece no front, como no front de
// referência que inspirou esta tela.
router.get('/unidades', (_req: Request, res: Response) => {
  res.status(200).json({ unidades: listarUnidades() });
});

// Chamado uma vez pelo front web antes da primeira mensagem do chat, com o nome e a unidade que o
// profissional escolheu na tela de identificação.
router.post('/identificacao', async (req: Request, res: Response): Promise<any> => {
  const { identificador, nome, unidade_cnes } = req.body;

  if (!identificador || !nome || !unidade_cnes) {
    return res.status(400).json({
      success: false,
      error: "Os campos 'identificador', 'nome' e 'unidade_cnes' são obrigatórios.",
    });
  }

  try {
    await atualizarInterlocutor('web', identificador, { nome, unidade_cnes });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Perfil] Erro ao gravar identificação:', error);
    return res.status(500).json({ success: false, error: 'Falha ao gravar identificação.' });
  }
});

export default router;
