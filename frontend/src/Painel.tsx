import { useEffect, useState } from 'react'
import { XIcon, CopyIcon, CheckIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { RiskBadge } from '@/components/ui/risk-badge'
import { cn } from '@/lib/utils'
import type { CorRisco, DadosPainel, DetalheEncaminhamento, ResumoEncaminhamento } from './types'

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CORES_RISCO: Record<string, string> = {
  Vermelha: 'var(--risco-vermelha)',
  Amarela: 'var(--risco-amarela)',
  Verde: 'var(--risco-verde)',
  Azul: 'var(--risco-azul)',
}

const PERIODOS: [string, string][] = [
  ['7', '7 dias'],
  ['30', '30 dias'],
  ['tudo', 'Tudo'],
]

export default function Painel({
  apiBaseUrl,
  onFechar,
}: {
  apiBaseUrl: string
  onFechar: () => void
}) {
  const [periodo, setPeriodo] = useState('30')
  // Um único estado que carrega o período a que o resultado pertence. "Carregando"
  // vira coisa derivada (o resultado em mãos ainda não é do período pedido), o
  // que evita setState síncrono dentro do efeito e o render em cascata que vem
  // junto.
  const [resultado, setResultado] = useState<{
    periodo: string
    dados?: DadosPainel
    erro?: boolean
  } | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch(`${apiBaseUrl}/painel?periodo=${periodo}`)
      .then((r) => {
        if (!r.ok) throw new Error('falha')
        return r.json()
      })
      .then((d: DadosPainel) => {
        if (!cancelado) setResultado({ periodo, dados: d })
      })
      .catch(() => {
        if (!cancelado) setResultado({ periodo, erro: true })
      })
    // Resposta de um período antigo não pode sobrescrever a do período atual.
    return () => {
      cancelado = true
    }
  }, [apiBaseUrl, periodo])

  const carregando = resultado?.periodo !== periodo
  const erro = !carregando && !!resultado?.erro
  const dados = !carregando && !erro ? (resultado?.dados ?? null) : null

  // Lista de encaminhamentos gerados no período — drill-down: "qual foi o encaminhamento para esta
  // conversa?". Carregada à parte dos números agregados acima, sem bloquear a renderização deles.
  const [resultadoEncaminhamentos, setResultadoEncaminhamentos] = useState<{
    periodo: string
    lista?: ResumoEncaminhamento[]
    erro?: boolean
  } | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch(`${apiBaseUrl}/encaminhamentos?periodo=${periodo}`)
      .then((r) => {
        if (!r.ok) throw new Error('falha')
        return r.json()
      })
      .then((d: { encaminhamentos: ResumoEncaminhamento[] }) => {
        if (!cancelado) setResultadoEncaminhamentos({ periodo, lista: d.encaminhamentos || [] })
      })
      .catch(() => {
        if (!cancelado) setResultadoEncaminhamentos({ periodo, erro: true })
      })
    return () => {
      cancelado = true
    }
  }, [apiBaseUrl, periodo])

  const carregandoEncaminhamentos = resultadoEncaminhamentos?.periodo !== periodo
  const encaminhamentos = !carregandoEncaminhamentos ? (resultadoEncaminhamentos?.lista ?? null) : null

  // Detalhe aberto no modal "Ver texto" — buscado sob demanda (a lista acima nunca carrega o texto
  // completo de cada encaminhamento, só o suficiente pra identificar a conversa).
  const [idAberto, setIdAberto] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<{ id: string; dados?: DetalheEncaminhamento; erro?: boolean } | null>(
    null
  )

  useEffect(() => {
    if (!idAberto) return
    let cancelado = false
    fetch(`${apiBaseUrl}/encaminhamentos/${idAberto}`)
      .then((r) => {
        if (!r.ok) throw new Error('falha')
        return r.json()
      })
      .then((d: DetalheEncaminhamento) => {
        if (!cancelado) setDetalhe({ id: idAberto, dados: d })
      })
      .catch(() => {
        if (!cancelado) setDetalhe({ id: idAberto, erro: true })
      })
    return () => {
      cancelado = true
    }
  }, [apiBaseUrl, idAberto])

  const vazio = dados && !dados.casos && !dados.textos && !dados.naoElegiveis
  // "casos" e "textos" vêm de dois tipos de evento contados independentemente dentro da janela do
  // período (caso_iniciado e texto_gerado) — um caso aberto antes do período, mas finalizado dentro
  // dele, soma em "textos" sem um "caso" correspondente na mesma janela, o que pode empurrar a
  // proporção acima de 100%. A taxa não pode significar mais que "tudo que podia finalizar,
  // finalizou", por isso o teto aqui.
  const taxaFinalizacao =
    dados && dados.casos ? Math.min(100, Math.round((100 * dados.textos) / dados.casos)) : null

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-6 py-5">
        <div>
          <h1 className="font-serif text-[1.5rem] font-bold tracking-[-0.01em] text-ink">Painel de uso</h1>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
            Contagens de uso. Nenhum texto de caso é registrado aqui.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Período"
            className="flex gap-0.5 rounded-md border border-line p-0.5"
          >
            {PERIODOS.map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={periodo === valor}
                onClick={() => setPeriodo(valor)}
                className={cn(
                  'rounded-sm px-3 py-1.5 text-[0.8125rem] font-medium transition-colors duration-[120ms] ease-brand',
                  periodo === valor
                    ? 'bg-surface-2 text-ink'
                    : 'text-ink-muted hover:text-ink'
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={onFechar}>
            Voltar ao chat
          </Button>
        </div>
      </header>

      {carregando && <p className="px-6 py-10 text-[0.875rem] text-ink-muted">Carregando…</p>}

      {erro && (
        <p className="mx-6 my-10 rounded-lg border border-risco-vermelha/35 bg-[color-mix(in_oklch,var(--risco-vermelha)_12%,var(--bg))] px-4 py-3 text-[0.875rem] text-ink">
          Não foi possível carregar o painel. Tente de novo em alguns instantes.
        </p>
      )}

      {dados && !carregando && !erro && vazio && (
        <p className="px-6 py-10 text-[0.875rem] text-ink-muted">
          Nenhum caso registrado neste período ainda.
        </p>
      )}

      {dados && !carregando && !erro && !vazio && (
        <div className="flex flex-col gap-8 px-6 py-7">
          {/* Métricas: número grande sobre o próprio fundo, separadas por borda.
              Sem grade de cartões idênticos (DESIGN.md secção 7). */}
          <section className="flex flex-wrap gap-y-6">
            <Metrica valor={dados.casos} rotulo="Casos iniciados" />
            <Metrica valor={dados.textos} rotulo="Encaminhamentos gerados" />
            <Metrica valor={dados.naoElegiveis} rotulo="Não elegíveis" />
            <Metrica
              valor={taxaFinalizacao !== null ? `${taxaFinalizacao}%` : '–'}
              rotulo="Taxa de finalização"
            />
            {dados.urgencias > 0 && (
              <Metrica valor={dados.urgencias} rotulo="Alertas de urgência" alerta />
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Bloco titulo="Por especialidade">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[0.875rem]">
                  <thead>
                    <tr>
                      {['Especialidade', 'Casos', 'Encam.', 'Inelegíveis'].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            'border-b border-line pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-faint',
                            i === 0 ? 'text-left' : 'text-right'
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.especialidades.map((e) => (
                      <tr key={e.especialidade}>
                        <td className="border-b border-line/50 py-2.5 capitalize text-ink">
                          {e.especialidade}
                        </td>
                        <td className="border-b border-line/50 py-2.5 text-right tabular-nums text-ink">
                          {e.casos}
                        </td>
                        <td className="border-b border-line/50 py-2.5 text-right tabular-nums text-ink">
                          {e.textos}
                        </td>
                        <td className="border-b border-line/50 py-2.5 text-right tabular-nums text-ink">
                          {e.naoElegiveis}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Bloco>

            <Bloco titulo="Classificação de risco">
              {Object.keys(dados.cores).length === 0 ? (
                <p className="text-[0.875rem] text-ink-muted">
                  Nenhum encaminhamento com cor registrada ainda.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {Object.entries(dados.cores).map(([cor, qtd]) => (
                    <li key={cor} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[0.8125rem] text-ink">{cor}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(6, (100 * qtd) / Math.max(...Object.values(dados.cores)))}%`,
                            backgroundColor: CORES_RISCO[cor as CorRisco] || 'var(--indigo-fill)',
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[0.8125rem] tabular-nums text-ink-muted">
                        {qtd}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            {dados.regioes.length > 0 && (
              <Bloco titulo="Por região de saúde">
                <ListaSimples itens={dados.regioes} />
              </Bloco>
            )}

            {dados.unidades.length > 0 && (
              <Bloco titulo="Unidades mais ativas">
                <ListaSimples itens={dados.unidades} />
              </Bloco>
            )}
          </div>

          <Bloco titulo="Encaminhamentos gerados">
            <p className="-mt-2 mb-4 text-[0.8125rem] text-ink-muted">
              O texto de cada encaminhamento só aparece ao abrir "Ver texto" — aqui na lista, só o
              fato de que ele existe.
            </p>

            {carregandoEncaminhamentos && (
              <p className="text-[0.875rem] text-ink-muted">Carregando…</p>
            )}

            {!carregandoEncaminhamentos && resultadoEncaminhamentos?.erro && (
              <p className="text-[0.875rem] text-ink-muted">
                Não foi possível carregar a lista de encaminhamentos.
              </p>
            )}

            {!carregandoEncaminhamentos && encaminhamentos && encaminhamentos.length === 0 && (
              <p className="text-[0.875rem] text-ink-muted">
                Nenhum encaminhamento gerado neste período ainda.
              </p>
            )}

            {!carregandoEncaminhamentos && encaminhamentos && encaminhamentos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[0.875rem]">
                  <thead>
                    <tr>
                      {['Quando', 'Especialidade', 'Risco', 'Situação', 'Profissional', 'Unidade', ''].map(
                        (h) => (
                          <th
                            key={h}
                            className="border-b border-line pb-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-faint"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {encaminhamentos.map((enc) => (
                      <tr key={enc.id}>
                        <td className="whitespace-nowrap border-b border-line/50 py-2.5 tabular-nums text-ink-muted">
                          {formatarData(enc.criadoEm)}
                        </td>
                        <td className="border-b border-line/50 py-2.5 capitalize text-ink">
                          {enc.especialidade}
                        </td>
                        <td className="border-b border-line/50 py-2.5">
                          {enc.classificacaoRisco ? (
                            <RiskBadge cor={enc.classificacaoRisco} />
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="border-b border-line/50 py-2.5 text-ink">
                          {enc.elegivel ? 'Elegível' : 'Não elegível'}
                        </td>
                        <td className="max-w-[12rem] truncate border-b border-line/50 py-2.5 text-ink">
                          {enc.profissional}
                        </td>
                        <td className="max-w-[12rem] truncate border-b border-line/50 py-2.5 text-ink-muted">
                          {enc.unidade}
                        </td>
                        <td className="border-b border-line/50 py-2.5 text-right">
                          <Button variant="outline" size="sm" onClick={() => setIdAberto(enc.id)}>
                            Ver texto
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>
        </div>
      )}

      {idAberto && (
        <DetalheEncaminhamentoModal
          carregando={!detalhe || detalhe.id !== idAberto}
          erro={!!detalhe && detalhe.id === idAberto && !!detalhe.erro}
          dados={detalhe && detalhe.id === idAberto ? (detalhe.dados ?? null) : null}
          onFechar={() => setIdAberto(null)}
        />
      )}
    </main>
  )
}

function DetalheEncaminhamentoModal({
  carregando,
  erro,
  dados,
  onFechar,
}: {
  carregando: boolean
  erro: boolean
  dados: DetalheEncaminhamento | null
  onFechar: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!dados) return
    try {
      await navigator.clipboard.writeText(dados.resumoSisreg)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Texto do encaminhamento"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
      className="fixed inset-0 z-40 grid place-items-center bg-[rgb(8_10_30_/_0.6)] p-4"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-surface shadow-[0_16px_40px_rgb(8_10_30_/_0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="font-serif text-[1.25rem] font-bold tracking-[-0.01em] text-ink">
              Texto do encaminhamento
            </h2>
            {dados && (
              <p className="mt-1 text-[0.8125rem] text-ink-muted">
                {dados.especialidade} · {formatarData(dados.criadoEm)} ·{' '}
                {dados.elegivel ? 'Elegível' : 'Não elegível'}
                {dados.classificacaoRisco ? ` · Risco ${dados.classificacaoRisco}` : ''}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onFechar} aria-label="Fechar">
            <XIcon />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {carregando && <p className="text-[0.875rem] text-ink-muted">Carregando…</p>}
          {!carregando && erro && (
            <p className="text-[0.875rem] text-ink-muted">
              Não foi possível carregar o texto deste encaminhamento.
            </p>
          )}
          {!carregando && !erro && dados && (
            <div className="whitespace-pre-wrap rounded-lg border border-line bg-[var(--surface-input)] p-4 font-mono text-[0.8125rem] leading-relaxed text-ink">
              {dados.resumoSisreg}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onFechar}>
            Fechar
          </Button>
          <Button onClick={() => void copiar()} disabled={!dados}>
            {copiado ? (
              <>
                <CheckIcon /> Copiado
              </>
            ) : (
              <>
                <CopyIcon /> Copiar texto
              </>
            )}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function Metrica({
  valor,
  rotulo,
  alerta = false,
}: {
  valor: number | string
  rotulo: string
  alerta?: boolean
}) {
  return (
    <div className="min-w-[9rem] flex-1 border-l border-line pl-4 first:border-l-0 first:pl-0">
      <span
        className={cn(
          'block text-[2rem] font-bold leading-none tracking-[-0.02em] tabular-nums',
          alerta ? 'text-risco-vermelha' : 'text-ink'
        )}
      >
        {valor}
      </span>
      <span className="mt-1.5 block text-[0.8125rem] text-ink-muted">{rotulo}</span>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-4 font-serif text-[1.125rem] font-semibold tracking-[-0.005em] text-ink">{titulo}</h2>
      {children}
    </section>
  )
}

function ListaSimples({ itens }: { itens: { nome: string; casos: number }[] }) {
  return (
    <ul className="flex flex-col">
      {itens.map((item) => (
        <li
          key={item.nome}
          className="flex items-center justify-between gap-4 border-b border-line/50 py-2.5 text-[0.875rem] last:border-b-0"
        >
          <span className="min-w-0 truncate text-ink">{item.nome}</span>
          <span className="shrink-0 tabular-nums text-ink-muted">{item.casos}</span>
        </li>
      ))}
    </ul>
  )
}
