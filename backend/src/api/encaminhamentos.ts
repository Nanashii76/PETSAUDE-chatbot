import { Router, type Request, type Response } from 'express';
import { listarEncaminhamentos, buscarDetalheEncaminhamento } from '../core/encaminhamentos.js';

const router = Router();

router.get('/encaminhamentos', async (req: Request, res: Response): Promise<any> => {
  try {
    const periodo = typeof req.query.periodo === 'string' ? req.query.periodo : '30';
    const encaminhamentos = await listarEncaminhamentos(periodo);
    return res.status(200).json({ encaminhamentos });
  } catch (error) {
    console.error('[Encaminhamentos] Erro ao listar:', error);
    return res.status(500).json({ error: 'Falha ao listar os encaminhamentos.' });
  }
});

router.get('/encaminhamentos/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const detalhe = await buscarDetalheEncaminhamento(String(req.params.id));
    if (!detalhe) {
      return res.status(404).json({ error: 'Encaminhamento não encontrado.' });
    }
    return res.status(200).json(detalhe);
  } catch (error) {
    console.error('[Encaminhamentos] Erro ao buscar detalhe:', error);
    return res.status(500).json({ error: 'Falha ao buscar o encaminhamento.' });
  }
});

export default router;
