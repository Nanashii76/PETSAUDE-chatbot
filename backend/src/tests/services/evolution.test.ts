import { describe, it, expect } from 'vitest';
import { extrairMensagemDoWebhookEvolution } from '../../services/evolution.js';

describe('extrairMensagemDoWebhookEvolution', () => {
  it('extrai remetente e mensagem de um "conversation" válido', () => {
    const payload = {
      data: {
        key: { fromMe: false, remoteJid: '5561999999999@s.whatsapp.net' },
        message: { conversation: 'Olá, preciso de ajuda' },
      },
    };

    expect(extrairMensagemDoWebhookEvolution(payload)).toEqual({
      remetenteId: '5561999999999',
      mensagem: 'Olá, preciso de ajuda',
    });
  });

  it('extrai mensagem de "extendedTextMessage.text" (mensagens com citação/link preview)', () => {
    const payload = {
      data: {
        key: { fromMe: false, remoteJid: '5561988887777@s.whatsapp.net' },
        message: { extendedTextMessage: { text: 'Paciente de 62 anos...' } },
      },
    };

    expect(extrairMensagemDoWebhookEvolution(payload)).toEqual({
      remetenteId: '5561988887777',
      mensagem: 'Paciente de 62 anos...',
    });
  });

  it('ignora mensagens enviadas pelo próprio bot (fromMe: true)', () => {
    const payload = {
      data: {
        key: { fromMe: true, remoteJid: '5561999999999@s.whatsapp.net' },
        message: { conversation: 'Prezado(a) profissional...' },
      },
    };

    expect(extrairMensagemDoWebhookEvolution(payload)).toBeNull();
  });

  it('retorna null quando não há "data" no payload (outros eventos da Evolution)', () => {
    expect(extrairMensagemDoWebhookEvolution({ event: 'connection.update' })).toBeNull();
  });

  it('retorna null para mensagens sem texto (mídia, figurinha, etc.)', () => {
    const payload = {
      data: {
        key: { fromMe: false, remoteJid: '5561999999999@s.whatsapp.net' },
        message: { imageMessage: { caption: 'foto' } },
      },
    };

    expect(extrairMensagemDoWebhookEvolution(payload)).toBeNull();
  });

  it('captura erro de parsing inesperado e retorna null em vez de lançar', () => {
    const payload = {
      data: {
        key: { fromMe: false, get remoteJid(): string { throw new Error('boom'); } },
        message: { conversation: 'oi' },
      },
    };

    expect(extrairMensagemDoWebhookEvolution(payload)).toBeNull();
  });
});
