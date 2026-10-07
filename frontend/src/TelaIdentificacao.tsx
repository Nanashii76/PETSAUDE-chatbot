import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'
import type { Unidade } from './types'

function normalizar(texto: string): string[] {
  const semAcento = texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const palavras = semAcento.match(/[a-z]+|\d+/g) || []
  const ignoradas = new Set(['de', 'da', 'do', 'n', 'no'])
  return palavras
    .filter((p) => !ignoradas.has(p))
    .map((p) => (/^\d+$/.test(p) ? String(parseInt(p, 10)) : p))
}

export default function TelaIdentificacao({
  apiBaseUrl,
  onConfirmar,
}: {
  apiBaseUrl: string
  onConfirmar: (dados: { nome: string; unidade: Unidade }) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [busca, setBusca] = useState('')
  const [selecionada, setSelecionada] = useState<Unidade | null>(null)
  const [mostrarLista, setMostrarLista] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const listaId = 'lista-unidades'
  const campoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${apiBaseUrl}/unidades`)
      .then((r) => r.json())
      .then((d) => setUnidades(d.unidades || []))
      .catch(() => setUnidades([]))
  }, [apiBaseUrl])

  const achadas = useMemo(() => {
    const termos = normalizar(busca)
    if (termos.length === 0) return []
    return unidades
      .filter((u) => {
        const palavras = new Set(normalizar(`${u.rotulo} ${u.ra || ''} ${u.regiao || ''}`))
        return termos.every(
          (t) => palavras.has(t) || (t.length > 3 && [...palavras].some((p) => p.startsWith(t)))
        )
      })
      .slice(0, 8)
  }, [busca, unidades])

  function escolher(unidade: Unidade) {
    setSelecionada(unidade)
    setBusca(unidade.rotulo)
    setMostrarLista(false)
    setErro('')
  }

  /** Navegação por teclado no combobox — exigência de acessibilidade do DESIGN.md. */
  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!mostrarLista || achadas.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDestaque((d) => (d + 1) % achadas.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestaque((d) => (d - 1 + achadas.length) % achadas.length)
    } else if (e.key === 'Enter' && achadas[destaque]) {
      e.preventDefault()
      escolher(achadas[destaque])
    } else if (e.key === 'Escape') {
      setMostrarLista(false)
    }
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Informe seu nome.')
      return
    }
    if (!selecionada) {
      setErro('Escolha uma unidade de saúde na lista.')
      campoRef.current?.focus()
      return
    }
    setEnviando(true)
    try {
      await onConfirmar({ nome: nome.trim(), unidade: selecionada })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <main className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo altura={30} className="text-ink" />
        </div>

        <h2 className="text-balance font-serif text-[1.875rem] font-bold leading-[1.15] tracking-[-0.015em] text-gold">
          Antes de começar
        </h2>
        <p className="mt-2 max-w-[52ch] text-pretty text-[0.9375rem] leading-relaxed text-ink-muted">
          Informe seu nome e a unidade onde atua. Isso permite à regulação entender de onde vêm os
          encaminhamentos.
        </p>

        <form onSubmit={confirmar} className="mt-7 flex flex-col gap-5">
          <div>
            <label htmlFor="nome" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
              Seu nome
            </label>
            <input
              id="nome"
              type="text"
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como devemos te chamar"
              className="w-full rounded-md border border-line bg-[var(--surface-input)] px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-ink-muted focus:border-azure"
            />
          </div>

          <div>
            <label htmlFor="unidade" className="mb-1 block text-[0.8125rem] font-semibold text-ink">
              Unidade de saúde
            </label>
            <p className="mb-1.5 text-[0.75rem] text-ink-muted">
              Digite parte do nome, por exemplo "UBS 13" ou "Samambaia".
            </p>

            <div className="relative">
              <input
                ref={campoRef}
                id="unidade"
                type="text"
                role="combobox"
                aria-expanded={mostrarLista}
                aria-controls={listaId}
                aria-autocomplete="list"
                aria-activedescendant={
                  mostrarLista && achadas[destaque] ? `unidade-${achadas[destaque].cnes}` : undefined
                }
                autoComplete="off"
                value={busca}
                placeholder="Buscar unidade"
                onChange={(e) => {
                  setBusca(e.target.value)
                  setSelecionada(null)
                  setDestaque(0)
                  setMostrarLista(true)
                }}
                onKeyDown={aoTeclar}
                onFocus={() => busca && setMostrarLista(true)}
                onBlur={() => setTimeout(() => setMostrarLista(false), 150)}
                className="w-full rounded-md border border-line bg-[var(--surface-input)] px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-ink-muted focus:border-azure"
              />

              {mostrarLista && busca && (
                <ul
                  id={listaId}
                  role="listbox"
                  className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 max-h-64 overflow-y-auto rounded-md border border-line bg-surface-2 py-1 shadow-[0_16px_40px_rgb(8_10_30_/_0.55)]"
                >
                  {achadas.length === 0 && (
                    <li className="px-3.5 py-2.5 text-[0.8125rem] text-ink-muted">
                      Nenhuma unidade encontrada. Tente o número e a região, ou "regulação" / "outro".
                    </li>
                  )}
                  {achadas.map((u, i) => (
                    <li
                      key={u.cnes}
                      id={`unidade-${u.cnes}`}
                      role="option"
                      aria-selected={i === destaque}
                      onMouseEnter={() => setDestaque(i)}
                      onMouseDown={(ev) => {
                        ev.preventDefault()
                        escolher(u)
                      }}
                      className={cn(
                        'cursor-pointer px-3.5 py-2.5 text-[0.875rem]',
                        i === destaque ? 'bg-indigo-fill text-ink' : 'text-ink'
                      )}
                    >
                      <span className="block">{u.rotulo}</span>
                      {u.regiao && (
                        <small
                          className={cn(
                            'block text-[0.75rem]',
                            i === destaque ? 'text-ink/80' : 'text-ink-muted'
                          )}
                        >
                          Região {u.regiao}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {erro && (
            <p
              role="alert"
              className="rounded-md border border-risco-vermelha/35 bg-[color-mix(in_oklch,var(--risco-vermelha)_12%,var(--bg))] px-3 py-2 text-[0.8125rem] text-ink"
            >
              {erro}
            </p>
          )}

          <Button type="submit" size="lg" disabled={enviando} className="w-full">
            {enviando ? 'Entrando…' : 'Começar triagem'}
          </Button>
        </form>
      </main>
    </div>
  )
}
