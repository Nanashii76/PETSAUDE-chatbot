import { Router, type Request, type Response } from 'express';
import { montarPainel } from '../core/painel.js';

const router = Router();

router.get('/painel', async (req: Request, res: Response): Promise<any> => {
  try {
    const periodo = typeof req.query.periodo === 'string' ? req.query.periodo : '30';
    const painel = await montarPainel(periodo);
    return res.status(200).json(painel);
  } catch (error) {
    console.error('[Painel] Erro ao montar painel:', error);
    return res.status(500).json({ error: 'Falha ao montar o painel.' });
  }
});

export default router;
