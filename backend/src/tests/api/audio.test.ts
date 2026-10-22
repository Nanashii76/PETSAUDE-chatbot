import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import audioRoutes from '../../api/audio.js';
import * as audioService from '../../services/audio.js';

describe('Rota POST /api/transcrever-audio', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', audioRoutes);
    vi.restoreAllMocks();
  });

  it('retorna 400 se nenhum arquivo de áudio for enviado no campo audio', async () => {
    const res = await request(app)
      .post('/api/transcrever-audio')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Nenhum arquivo de áudio enviado');
  });

  it('retorna 400 se o arquivo não for de áudio (MIME type rejeitado)', async () => {
    const res = await request(app)
      .post('/api/transcrever-audio')
      .attach('audio', Buffer.from('conteudo texto'), 'documento.txt');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Formato de arquivo inválido');
  });

  it('processa e retorna 200 com transcrição bem-sucedida', async () => {
    vi.spyOn(audioService, 'transcreverAudio').mockResolvedValue({
      text: 'Paciente refere dor de cabeça há 3 dias',
      provider: 'groq',
      durationSeconds: 3.2,
    });

    const res = await request(app)
      .post('/api/transcrever-audio')
      .attach('audio', Buffer.from('conteudo-falso-audio'), {
        filename: 'gravacao.webm',
        contentType: 'audio/webm',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.text).toBe('Paciente refere dor de cabeça há 3 dias');
    expect(res.body.provider).toBe('groq');
    expect(res.body.durationSeconds).toBe(3.2);
  });

  it('retorna 504 em caso de timeout na transcrição', async () => {
    vi.spyOn(audioService, 'transcreverAudio').mockRejectedValue(
      new Error('Timeout de transcrição excedido')
    );

    const res = await request(app)
      .post('/api/transcrever-audio')
      .attach('audio', Buffer.from('conteudo-falso-audio'), {
        filename: 'gravacao.ogg',
        contentType: 'audio/ogg',
      });

    expect(res.status).toBe(504);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Timeout');
  });

  it('retorna 500 em caso de erro interno do serviço', async () => {
    vi.spyOn(audioService, 'transcreverAudio').mockRejectedValue(
      new Error('Serviço de transcrição indisponível (chaves não configuradas).')
    );

    const res = await request(app)
      .post('/api/transcrever-audio')
      .attach('audio', Buffer.from('conteudo-falso-audio'), {
        filename: 'gravacao.mp3',
        contentType: 'audio/mp3',
      });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Serviço de transcrição indisponível');
  });
});
