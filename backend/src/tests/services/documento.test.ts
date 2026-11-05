import { describe, it, expect, vi, beforeEach } from 'vitest';

const { extractTextMock } = vi.hoisted(() => ({ extractTextMock: vi.fn() }));

vi.mock('unpdf', () => ({ extractText: extractTextMock }));

const { extrairTextoDocumento } = await import('../../services/documento.js');

describe('Serviço de Documento - extrairTextoDocumento', () => {
  beforeEach(() => {
    extractTextMock.mockReset();
  });

  it('lança erro se o buffer estiver vazio', async () => {
    await expect(
      extrairTextoDocumento({ buffer: Buffer.from([]), mimeType: 'application/pdf' })
    ).rejects.toThrow('Documento vazio ou inválido.');
    expect(extractTextMock).not.toHaveBeenCalled();
  });

  it('lança erro se o tipo MIME não for PDF', async () => {
    await expect(
      extrairTextoDocumento({ buffer: Buffer.from('fake-image-bytes'), mimeType: 'image/png' })
    ).rejects.toThrow('só aceitamos PDF');
    expect(extractTextMock).not.toHaveBeenCalled();
  });

  it('extrai e retorna o texto de um PDF válido, passando Uint8Array (não Buffer) para unpdf', async () => {
    extractTextMock.mockResolvedValue({ text: 'TSH: 8.2 mUI/L\nUltrassonografia: nódulo 1.2cm', totalPages: 1 });

    const resultado = await extrairTextoDocumento({
      buffer: Buffer.from('conteudo-pdf-fake'),
      mimeType: 'application/pdf',
    });

    expect(resultado.texto).toBe('TSH: 8.2 mUI/L\nUltrassonografia: nódulo 1.2cm');
    expect(resultado.paginas).toBe(1);
    expect(resultado.truncado).toBe(false);

    const [dataArg, optionsArg] = extractTextMock.mock.calls[0];
    expect(dataArg).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(dataArg)).toBe(false);
    expect(optionsArg).toEqual({ mergePages: true });
  });

  it('lança erro se o PDF não tiver nenhuma camada de texto (ex: só imagens escaneadas)', async () => {
    extractTextMock.mockResolvedValue({ text: '   ', totalPages: 2 });

    await expect(
      extrairTextoDocumento({ buffer: Buffer.from('pdf-escaneado'), mimeType: 'application/pdf' })
    ).rejects.toThrow('sem camada de texto');
  });

  it('trunca texto além do limite e sinaliza truncado: true', async () => {
    extractTextMock.mockResolvedValue({ text: 'a'.repeat(25_000), totalPages: 5 });

    const resultado = await extrairTextoDocumento({
      buffer: Buffer.from('pdf-grande'),
      mimeType: 'application/pdf',
    });

    expect(resultado.texto).toHaveLength(20_000);
    expect(resultado.truncado).toBe(true);
  });

  it('converte falha de parsing do pdf.js numa mensagem amigável', async () => {
    extractTextMock.mockRejectedValue(new Error('InvalidPDFException: bad xref'));

    await expect(
      extrairTextoDocumento({ buffer: Buffer.from('pdf-corrompido'), mimeType: 'application/pdf' })
    ).rejects.toThrow('Não foi possível ler este PDF');
  });
});
