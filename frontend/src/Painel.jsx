import React, { useEffect, useState } from 'react';

const CORES_RISCO = { Vermelha: '#f87171', Amarela: '#facc15', Verde: '#34d399', Azul: '#4f7df3' };

export default function Painel({ apiBaseUrl, onFechar }) {
  const [periodo, setPeriodo] = useState('30');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setCarregando(true);
    setErro(false);
    fetch(`${apiBaseUrl}/painel?periodo=${periodo}`)
      .then((r) => {
        if (!r.ok) throw new Error('falha');
        return r.json();
      })
      .then((d) => setDados(d))
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, [apiBaseUrl, periodo]);

  const vazio = dados && !dados.casos && !dados.textos && !dados.naoElegiveis;
  const taxaFinalizacao = dados && dados.casos ? Math.round((100 * dados.textos) / dados.casos) : null;

  return (
    <main className="painel">
      <header className="painel-header">
        <div>
          <h1>Painel de uso</h1>
          <p className="painel-subtitulo">Contagens de uso — sem texto de caso</p>
        </div>
        <div className="painel-acoes">
          <div className="painel-periodo" role="tablist" aria-label="Período">
            {[
              ['7', '7 dias'],
              ['30', '30 dias'],
              ['tudo', 'Tudo'],
            ].map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={periodo === valor}
                className={periodo === valor ? 'ativo' : ''}
                onClick={() => setPeriodo(valor)}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <button type="button" className="botao" onClick={onFechar}>Voltar ao chat</button>
        </div>
      </header>

      {carregando && <p className="painel-estado">Carregando...</p>}
      {erro && <p className="painel-estado erro">Não foi possível carregar o painel.</p>}

      {dados && !carregando && !erro && vazio && (
        <p className="painel-estado">Nenhum caso registrado neste período ainda.</p>
      )}

      {dados && !carregando && !erro && !vazio && (
        <>
          <section className="painel-cards">
            <div className="painel-card">
              <span className="painel-card-valor">{dados.casos}</span>
              <span className="painel-card-rotulo">Casos iniciados</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-valor">{dados.textos}</span>
              <span className="painel-card-rotulo">Encaminhamentos gerados</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-valor">{dados.naoElegiveis}</span>
              <span className="painel-card-rotulo">Não elegíveis</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-valor">{taxaFinalizacao !== null ? `${taxaFinalizacao}%` : '–'}</span>
              <span className="painel-card-rotulo">Taxa de finalização</span>
            </div>
            {dados.urgencias > 0 && (
              <div className="painel-card painel-card-alerta">
                <span className="painel-card-valor">{dados.urgencias}</span>
                <span className="painel-card-rotulo">Alertas de urgência</span>
              </div>
            )}
          </section>

          <div className="painel-colunas">
            <section className="painel-bloco">
              <h2>Por especialidade</h2>
              <div className="painel-tabela-wrap">
              <table className="painel-tabela">
                <thead>
                  <tr>
                    <th>Especialidade</th>
                    <th>Casos</th>
                    <th>Encam.</th>
                    <th>Inelegíveis</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.especialidades.map((e) => (
                    <tr key={e.especialidade}>
                      <td>{e.especialidade}</td>
                      <td>{e.casos}</td>
                      <td>{e.textos}</td>
                      <td>{e.naoElegiveis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>

            <section className="painel-bloco">
              <h2>Classificação de risco</h2>
              {Object.keys(dados.cores).length === 0 ? (
                <p className="painel-vazio-bloco">Nenhum encaminhamento com cor registrada ainda.</p>
              ) : (
                <ul className="painel-barras">
                  {Object.entries(dados.cores).map(([cor, qtd]) => (
                    <li key={cor}>
                      <span className="painel-barra-rotulo">{cor}</span>
                      <div className="painel-barra-trilho">
                        <div
                          className="painel-barra-preenchida"
                          style={{
                            width: `${Math.max(6, (100 * qtd) / Math.max(...Object.values(dados.cores)))}%`,
                            backgroundColor: CORES_RISCO[cor] || '#8b93a7',
                          }}
                        />
                      </div>
                      <span className="painel-barra-valor">{qtd}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {dados.regioes.length > 0 && (
              <section className="painel-bloco">
                <h2>Por região de saúde</h2>
                <ul className="painel-lista-simples">
                  {dados.regioes.map((r) => (
                    <li key={r.nome}><span>{r.nome}</span><span>{r.casos}</span></li>
                  ))}
                </ul>
              </section>
            )}

            {dados.unidades.length > 0 && (
              <section className="painel-bloco">
                <h2>Unidades mais ativas</h2>
                <ul className="painel-lista-simples">
                  {dados.unidades.map((u) => (
                    <li key={u.nome}><span>{u.nome}</span><span>{u.casos}</span></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}
