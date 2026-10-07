import * as React from "react"
import { motion } from "framer-motion"
import { IconArrowUp } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

export interface LiquidPromptInputProps {
  /** Texto atual do campo (controlado pelo componente pai) */
  value: string
  /** Disparado a cada mudança de texto */
  onValueChange: (value: string) => void
  /** Disparado ao enviar (Enter sem Shift, ou clique) */
  onSubmit: (value: string) => void
  /** Texto do campo quando vazio */
  placeholder?: string
  /** Altura mínima em px — maior no estado inicial, menor depois */
  minHeight?: number
  /** Altura máxima em px antes de rolar */
  maxHeight?: number
  /** Bloqueia entrada e envio enquanto a resposta é gerada */
  disabled?: boolean
  /** Permite ao pai focar o campo (ex: depois de clicar numa sugestão) */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  /** Rótulo acessível do campo */
  ariaLabel?: string
  className?: string
}

/**
 * Campo de entrada do chat.
 *
 * Adaptado do "liquid multimodal input". Diferenças deliberadas em relação ao
 * original, todas registradas no DESIGN.md:
 *
 * 1. Vermelho trocado por azure. No original o botão de envio e o brilho eram
 *    `#cd1c18`. Aqui vermelho é cor de risco clínico (Vermelha) e não pode
 *    aparecer como cromo de marca — ver DESIGN.md, regra 1.
 * 2. Sem anexos. O backend (`webhook.ts`) só aceita texto, e anexo traz dado
 *    identificável de paciente, que depende da issue #11 e de decisão de base
 *    legal com a SES-DF.
 * 3. Sem seletor de modelo. O backend escolhe sozinho na cascata do
 *    OpenRouter; oferecer a escolha seria mentir sobre o que o clique faz.
 * 4. A borda animada só gira em foco. No original girava sempre; o DESIGN.md
 *    reserva animação em laço para o indicador de "gerando resposta".
 */
export function LiquidPromptInput({
  value,
  onValueChange,
  onSubmit,
  placeholder = "Descreva o quadro do paciente…",
  minHeight = 56,
  maxHeight = 220,
  disabled = false,
  inputRef,
  ariaLabel = "Mensagem para a regulação",
  className,
}: LiquidPromptInputProps) {
  const interno = React.useRef<HTMLTextAreaElement>(null)
  const taRef = inputRef ?? interno

  React.useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(Math.max(ta.scrollHeight, minHeight), maxHeight) + "px"
  }, [value, minHeight, maxHeight, taRef])

  function submit() {
    const texto = value.trim()
    if (!texto || disabled) return
    onSubmit(texto)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const podeEnviar = value.trim().length > 0 && !disabled

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "group relative isolate flex w-full flex-col gap-1 overflow-hidden rounded-lg p-2.5",
          "border border-line bg-surface transition-colors duration-[120ms] ease-brand",
          "focus-within:border-azure/60"
        )}
      >
        {/* Borda em gradiente: parada por padrão, gira só com o campo em foco. */}
        <div
          aria-hidden
          className={cn(
            "liquid-edge pointer-events-none absolute inset-0 z-10 rounded-lg",
            "opacity-0 transition-opacity duration-500 group-focus-within:opacity-100"
          )}
        />

        <div className="relative z-20 w-full min-w-0">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            aria-label={ariaLabel}
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] leading-relaxed",
              "text-ink outline-none placeholder:text-ink-muted",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
            style={{ minHeight, maxHeight }}
          />
        </div>

        <div className="relative z-20 mt-auto flex w-full items-center gap-1 px-1">
          <div className="ml-auto flex items-center gap-2">
            <span
              aria-hidden
              className="hidden text-[0.6875rem] text-ink-faint sm:inline"
            >
              Enter envia · Shift+Enter quebra linha
            </span>
            <motion.button
              type="button"
              onClick={submit}
              disabled={!podeEnviar}
              aria-label="Enviar mensagem"
              whileTap={podeEnviar ? { scale: 0.92 } : undefined}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-[120ms] ease-brand",
                "bg-azure text-on-bright",
                "hover:bg-azure/90",
                "disabled:bg-surface-2 disabled:text-ink-faint"
              )}
              style={{ willChange: "transform" }}
            >
              <IconArrowUp size={16} stroke={2.5} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
