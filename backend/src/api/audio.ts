import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { transcreverAudio } from '../services/audio.js';

const router = Router();

// Configuração do multer com armazenamento em memória
// Limite de 10MB para o arquivo de áudio (baixo uso de recursos de infra)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Validação de tipo MIME aceito
    const acceptedMimes = [
      'audio/webm',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/opus',
      'video/webm', // Alguns navegadores gravam áudio webm com container video/webm
      'video/mp4',
    ];

    if (acceptedMimes.includes(file.mimetype.toLowerCase()) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo inválido. Apenas arquivos de áudio são permitidos.'));
    }
  },
});

/**
 * POST /api/transcrever-audio
 * Rota para envio multipart/form-data com o campo 'audio'.
 * O áudio é mantido apenas em buffer de memória durante o processamento
 * e descartado automaticamente pelo garbage collector após a resposta.
 * 
 * LGPD:
 * - Nenhum dado de transcrição ou dado clínico é logado no console.
 */
router.post('/transcrever-audio', (req: Request, res: Response, next) => {
  upload.single('audio')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'Tamanho máximo do áudio excedido (limite: 10MB).',
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'Erro no upload do arquivo de áudio.',
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
        error: "Nenhum arquivo de áudio enviado. O campo esperado no form-data é 'audio'.",
      });
    }

    const resultado = await transcreverAudio({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      timeoutMs: 20_000,
    });

    return res.status(200).json({
      success: true,
      text: resultado.text,
      provider: resultado.provider,
      durationSeconds: resultado.durationSeconds,
    });
  } catch (error: any) {
    // Log técnico seguro sem vazamento de dados de pacientes
    console.error('[AudioRoute] Erro na transcrição de áudio:', error?.message || error);

    const status = error?.message?.includes('Timeout') ? 504 : 500;
    return res.status(status).json({
      success: false,
      error: error?.message || 'Falha ao processar e transcrever áudio.',
    });
  }
});

export default router;
