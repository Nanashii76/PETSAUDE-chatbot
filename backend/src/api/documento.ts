import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { extrairTextoDocumento } from '../services/documento.js';

const router = Router();

// Mesmo limite e padrão de configuração de api/audio.ts: armazenamento em memória (nunca toca
// disco), tamanho máximo de 10MB.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.toLowerCase() === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo inválido. Por enquanto, só PDF é suportado.'));
    }
  },
});

/**
 * POST /api/documento/extrair
 * Rota para envio multipart/form-data com o campo 'documento'.
 * O arquivo é mantido apenas em buffer de memória durante o processamento e descartado
 * automaticamente pelo garbage collector após a resposta — nunca é salvo em disco.
 *
 * LGPD: nenhum conteúdo do documento (texto extraído ou bruto) é logado no console.
 */
router.post('/documento/extrair', (req: Request, res: Response, next) => {
  upload.single('documento')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'Tamanho máximo do documento excedido (limite: 10MB).',
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'Erro no upload do documento.',
      });
    }
    next();
  });
}, async (req: Request, res: Response): Promise<any> => {
  try {
    const file = req.file;

    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhum arquivo enviado. O campo esperado no form-data é 'documento'.",
      });
    }

    const resultado = await extrairTextoDocumento({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });

    return res.status(200).json({
      success: true,
      texto: resultado.texto,
      paginas: resultado.paginas,
      truncado: resultado.truncado,
      nomeArquivo: file.originalname,
    });
  } catch (error: any) {
    // Log técnico seguro, sem vazamento de conteúdo do documento.
    console.error('[DocumentoRoute] Erro na extração de documento:', error?.message || error);

    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha ao processar o documento.',
    });
  }
});

export default router;
