import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import documentoRoutes from '../../api/documento.js';
import * as documentoService from '../../services/documento.js';

describe('Rota POST /api/documento/extrair', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', documentoRoutes);
    vi.restoreAllMocks();
  });

  it('retorna 400 se nenhum arquivo for enviado no campo documento', async () => {
    const res = await request(app).post('/api/documento/extrair').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Nenhum arquivo enviado');
  });

  it('retorna 400 se o arquivo não for PDF (MIME type rejeitado)', async () => {
    const res = await request(app)
      .post('/api/documento/extrair')
      .attach('documento', Buffer.from('conteudo imagem'), {
        filename: 'foto.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Formato de arquivo inválido');
  });

  it('processa e retorna 200 com o texto extraído', async () => {
    vi.spyOn(documentoService, 'extrairTextoDocumento').mockResolvedValue({
      texto: 'TSH: 8.2 mUI/L',
      paginas: 1,
      truncado: false,
    });

    const res = await request(app)
      .post('/api/documento/extrair')
      .attach('documento', Buffer.from('conteudo-pdf-fake'), {
        filename: 'exame.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.texto).toBe('TSH: 8.2 mUI/L');
    expect(res.body.paginas).toBe(1);
    expect(res.body.truncado).toBe(false);
    expect(res.body.nomeArquivo).toBe('exame.pdf');
  });

  it('retorna 500 com a mensagem de erro do serviço quando a extração falha', async () => {
    vi.spyOn(documentoService, 'extrairTextoDocumento').mockRejectedValue(
      new Error('Não foi possível ler este PDF — o arquivo pode estar corrompido ou protegido.')
    );

    const res = await request(app)
      .post('/api/documento/extrair')
      .attach('documento', Buffer.from('pdf-corrompido'), {
        filename: 'exame.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Não foi possível ler este PDF');
  });
});
