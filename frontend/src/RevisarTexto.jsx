import React, { useState } from 'react';

export default function RevisarTexto({ relato, textoFinal, onFechar }) {
  const [copiado, setCopiado] = useState(false);

  async function confirmarECopiar() {
    try {
      await navigator.clipboard.writeText(textoFinal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="revisar-fundo" role="dialog" aria-modal="true" aria-label="Revisar e confirmar encaminhamento" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="revisar-painel">
        <header className="revisar-cabecalho">
          <h2>Revisar antes de copiar</h2>
          <button type="button" className="revisar-fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </header>
        <p className="revisar-intro">Confira se o texto gerado reflete fielmente o que você relatou antes de copiar para o SISREG.</p>

        <div className="revisar-colunas">
          <section>
            <h3>O que você relatou</h3>
            <div className="revisar-texto revisar-texto-relato">{relato || 'Nenhum relato registrado.'}</div>
          </section>
          <section>
            <h3>Texto gerado para o SISREG</h3>
            <div className="revisar-texto revisar-texto-final">{textoFinal}</div>
          </section>
        </div>

        <footer className="revisar-rodape">
          <button type="button" className="botao botao-fantasma" onClick={onFechar}>Fechar</button>
          <button type="button" className="botao botao-cheio" onClick={confirmarECopiar}>
            {copiado ? 'Copiado!' : 'Confirmar e copiar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
