import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CorRisco, DadosPainel } from './types'

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

  const vazio = dados && !dados.casos && !dados.textos && !dados.naoElegiveis
  const taxaFinalizacao =
    dados && dados.casos ? Math.round((100 * dados.textos) / dados.casos) : null

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
        </div>
      )}
    </main>
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
