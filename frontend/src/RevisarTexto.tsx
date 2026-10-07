import { useState } from 'react'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function RevisarTexto({
  relato,
  textoFinal,
  onFechar,
}: {
  relato?: string
  textoFinal: string
  onFechar: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  async function confirmarECopiar() {
    try {
      await navigator.clipboard.writeText(textoFinal)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Revisar e confirmar encaminhamento"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar()
      }}
      className="fixed inset-0 z-40 grid place-items-center bg-[rgb(8_10_30_/_0.6)] p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-surface shadow-[0_16px_40px_rgb(8_10_30_/_0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="font-serif text-[1.5rem] font-bold tracking-[-0.01em] text-ink">
              Revisar antes de copiar
            </h2>
            <p className="mt-1 max-w-[70ch] text-pretty text-[0.875rem] leading-relaxed text-ink-muted">
              Confira se o texto gerado reflete fielmente o que você relatou. A responsabilidade
              pelo conteúdo do encaminhamento continua sendo sua.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onFechar} aria-label="Fechar">
            <XIcon />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 md:grid-cols-2">
          <section className="flex min-h-0 flex-col">
            <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              O que você relatou
            </h3>
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-bg p-4 text-[0.875rem] leading-relaxed text-ink-muted">
              {relato || 'Nenhum relato registrado.'}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              Texto gerado para o SISREG
            </h3>
            {/* Mono: é o artefato que vai ser colado em outro sistema, não prosa
                de conversa (DESIGN.md secção 4). */}
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-[var(--surface-input)] p-4 font-mono text-[0.8125rem] leading-relaxed text-ink">
              {textoFinal}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onFechar}>
            Fechar
          </Button>
          <Button onClick={() => void confirmarECopiar()}>
            {copiado ? 'Copiado para a área de transferência' : 'Copiar texto do SISREG'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
