import React, { useEffect, useMemo, useState } from 'react';

function normalizar(texto) {
  const semAcento = texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const palavras = semAcento.match(/[a-z]+|\d+/g) || [];
  const ignoradas = new Set(['de', 'da', 'do', 'n', 'no']);
  return palavras.filter((p) => !ignoradas.has(p)).map((p) => (/^\d+$/.test(p) ? String(parseInt(p, 10)) : p));
}

export default function TelaIdentificacao({ apiBaseUrl, onConfirmar }) {
  const [nome, setNome] = useState('');
  const [unidades, setUnidades] = useState([]);
  const [busca, setBusca] = useState('');
  const [selecionada, setSelecionada] = useState(null);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch(`${apiBaseUrl}/unidades`)
      .then((r) => r.json())
      .then((d) => setUnidades(d.unidades || []))
      .catch(() => setUnidades([]));
  }, [apiBaseUrl]);

  const achadas = useMemo(() => {
    const termos = normalizar(busca);
    if (termos.length === 0) return [];
    return unidades
      .filter((u) => {
        const palavras = new Set(normalizar(`${u.rotulo} ${u.ra || ''} ${u.regiao || ''}`));
        return termos.every((t) => palavras.has(t) || (t.length > 3 && [...palavras].some((p) => p.startsWith(t))));
      })
      .slice(0, 8);
  }, [busca, unidades]);

  function escolher(unidade) {
    setSelecionada(unidade);
    setBusca(unidade.rotulo);
    setMostrarLista(false);
    setErro('');
  }

  async function confirmar(e) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro('Informe seu nome.');
      return;
    }
    if (!selecionada) {
      setErro('Escolha uma unidade de saúde na lista.');
      return;
    }
    setEnviando(true);
    try {
      await onConfirmar({ nome: nome.trim(), unidade: selecionada });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="app-container identificacao">
      <main className="identificacao-cartao">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12h4l2-7 4 14 2-7h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1>Regulação SUS</h1>
            <span className="brand-subtitle">SES-DF · Apoio Clínico</span>
          </div>
        </div>

        <h2>Antes de começar</h2>
        <p className="identificacao-intro">
          Informe seu nome e a unidade de saúde onde atua. Isso ajuda a regulação a entender de onde vêm os
          encaminhamentos.
        </p>

        <form onSubmit={confirmar}>
          <label htmlFor="nome">Seu nome</label>
          <input
            id="nome"
            type="text"
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Como devemos te chamar"
          />

          <label htmlFor="unidade">Unidade de saúde</label>
          <p className="identificacao-dica">Digite parte do nome para buscar, por exemplo "UBS 13" ou "Samambaia".</p>
          <div className="identificacao-busca">
            <input
              id="unidade"
              type="text"
              role="combobox"
              aria-expanded={mostrarLista}
              autoComplete="off"
              value={busca}
              placeholder="Buscar unidade"
              onChange={(e) => {
                setBusca(e.target.value);
                setSelecionada(null);
                setMostrarLista(true);
              }}
              onFocus={() => busca && setMostrarLista(true)}
              onBlur={() => setTimeout(() => setMostrarLista(false), 150)}
            />
            {mostrarLista && busca && (
              <ul className="identificacao-resultados">
                {achadas.length === 0 && <li className="identificacao-nenhuma">Nenhuma unidade encontrada. Tente o número e a região, ou "regulação" / "outro".</li>}
                {achadas.map((u) => (
                  <li key={u.cnes} onMouseDown={(ev) => { ev.preventDefault(); escolher(u); }}>
                    <span>{u.rotulo}</span>
                    {u.regiao && <small>Região {u.regiao}</small>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {erro && <p className="erro" role="alert">{erro}</p>}

          <button className="botao botao-cheio" type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Começar'}
          </button>
        </form>
      </main>
    </div>
  );
}
