import * as React from "react"
import { motion } from "framer-motion"
import {
  IconArrowUp,
  IconMicrophone,
  IconPlayerStop,
  IconX,
  IconLoader2,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { useAudioRecorder } from "@/lib/useAudioRecorder"

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
  /** Base URL da API para transcrição de áudio */
  apiBaseUrl?: string
}

function formatarTempo(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

/**
 * Campo de entrada do chat integrado com transcrição de áudio via Whisper.
 *
 * Segue estritamente as diretrizes do DESIGN.md e a referência visual em
 * /tmp/Maestri-drops/20aff057-6e51-476a-b9d2-1be63a9817ca.png:
 * - Botão de microfone para iniciar gravação.
 * - Barra inferior exibindo botão Cancelar (X), timer com dots e waveform dinâmico,
 *   e botão de Concluir Gravação / Enviar (Stop / Check).
 * - O áudio transcrito preenche o rascunho de texto preservando edições anteriores
 *   para revisão do profissional antes de enviar.
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
  apiBaseUrl,
}: LiquidPromptInputProps) {
  const interno = React.useRef<HTMLTextAreaElement>(null)
  const taRef = inputRef ?? interno

  // Ajuste dinâmico de altura do textarea
  React.useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(Math.max(ta.scrollHeight, minHeight), maxHeight) + "px"
  }, [value, minHeight, maxHeight, taRef])

  const handleTranscriptionSuccess = React.useCallback(
    (novoTexto: string) => {
      // Preserva rascunho existente e adiciona com espaço adequado
      const textoFinal = value.trim() ? `${value.trim()} ${novoTexto}` : novoTexto
      onValueChange(textoFinal)

      // Retorna foco para o textarea permitindo ao profissional revisar/editar
      setTimeout(() => {
        if (taRef.current) {
          taRef.current.focus()
          taRef.current.setSelectionRange(textoFinal.length, textoFinal.length)
        }
      }, 50)
    },
    [onValueChange, taRef, value]
  )

  const {
    state: audioState,
    durationSeconds,
    volumeLevel,
    errorMessage,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    clearError,
  } = useAudioRecorder({
    apiBaseUrl,
    onTranscriptionSuccess: handleTranscriptionSuccess,
  })

  function submit() {
    const texto = value.trim()
    if (!texto || disabled || audioState === "recording" || audioState === "transcribing") return
    onSubmit(texto)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const podeEnviar =
    value.trim().length > 0 && !disabled && audioState === "idle"
  const isGravando = audioState === "recording"
  const isTranscrevendo = audioState === "transcribing"

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "group relative isolate flex w-full flex-col gap-1 overflow-hidden rounded-lg p-2.5",
          "border border-line bg-surface transition-colors duration-[120ms] ease-brand",
          "focus-within:border-azure/60",
          isGravando && "border-azure/50 shadow-[0_0_15px_rgba(122,179,236,0.12)]"
        )}
      >
        {/* Borda em gradiente: parada por padrão, gira só com o campo em foco. */}
        <div
          aria-hidden
          className={cn(
            "liquid-edge pointer-events-none absolute inset-0 z-10 rounded-lg",
            "opacity-0 transition-opacity duration-500 group-focus-within:opacity-100",
            isGravando && "opacity-80"
          )}
        />

        {/* Notificação/Alerta de erro com botão de fechar */}
        {errorMessage && (
          <div className="relative z-20 mb-1 flex items-center justify-between rounded-md border border-line bg-surface-2/90 px-3 py-1.5 text-xs text-ink">
            <span className="truncate pr-2">{errorMessage}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-ink-muted hover:text-ink focus:outline-none"
              aria-label="Fechar aviso de erro"
            >
              <IconX size={14} />
            </button>
          </div>
        )}

        {/* Textarea de edição de texto */}
        <div className="relative z-20 w-full min-w-0">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              isGravando
                ? "Gravando áudio... O texto transcrito entrará aqui como rascunho."
                : isTranscrevendo
                ? "Transcrevendo áudio via Whisper..."
                : placeholder
            }
            aria-label={ariaLabel}
            disabled={disabled || isTranscrevendo}
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] leading-relaxed",
              "text-ink outline-none placeholder:text-ink-muted",
              "disabled:cursor-not-allowed disabled:opacity-60",
              isGravando && "placeholder:italic placeholder:text-azure/80"
            )}
            style={{ minHeight, maxHeight }}
          />
        </div>

        {/* Barra de controle inferior */}
        <div className="relative z-20 mt-auto flex w-full items-center justify-between gap-2 px-1">
          {/* Se estiver gravando: layout igual à referência /tmp/Maestri-drops/20aff057-6e51-476a-b9d2-1be63a9817ca.png */}
          {isGravando ? (
            <div className="flex w-full items-center justify-between gap-3 py-1">
              {/* Botão Cancelar gravação */}
              <button
                type="button"
                onClick={cancelRecording}
                aria-label="Cancelar gravação"
                title="Descartar gravação"
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-[120ms]",
                  "bg-surface-2 text-ink-muted hover:bg-surface-2/80 hover:text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
                )}
              >
                <IconX size={16} stroke={2.2} />
              </button>

              {/* Waveform animado e timer central */}
              <div className="flex flex-1 items-center justify-center gap-1.5 overflow-hidden px-2">
                {/* Timer tabular */}
                <span className="tabular shrink-0 text-xs font-semibold text-azure">
                  {formatarTempo(durationSeconds)}
                </span>

                {/* Trilha de dots pontilhados e barras de frequência estilo áudio */}
                <div
                  className="flex flex-1 items-center justify-center gap-1 max-w-[280px] sm:max-w-[380px]"
                  aria-hidden="true"
                >
                  {Array.from({ length: 24 }).map((_, i) => {
                    // Simulação visual da onda acústica combinando volume e posição
                    const distanceFromCenter = Math.abs(i - 12) / 12
                    const baseScale = Math.max(0.2, 1 - distanceFromCenter * 0.7)
                    const dynamicScale = Math.min(
                      2.4,
                      baseScale + volumeLevel * (1.5 + ((i % 4) * 0.3))
                    )
                    const heightPx = Math.max(3, Math.round(dynamicScale * 8))

                    return (
                      <span
                        key={i}
                        className={cn(
                          "w-1 rounded-full transition-all duration-75",
                          i % 2 === 0 ? "bg-azure" : "bg-indigo-300/80"
                        )}
                        style={{
                          height: `${heightPx}px`,
                          opacity: Math.max(0.35, 0.4 + volumeLevel * 0.6),
                        }}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Botão Parar Gravação e Transcrever */}
              <motion.button
                type="button"
                onClick={stopAndTranscribe}
                aria-label="Concluir gravação e transcrever"
                title="Concluir gravação e transcrever"
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-[120ms] ease-brand",
                  "bg-surface-2 text-azure hover:bg-surface-2/80 hover:text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
                )}
              >
                <IconPlayerStop size={16} stroke={2.5} />
              </motion.button>
            </div>
          ) : isTranscrevendo ? (
            /* Estado de transcrição ativa */
            <div className="flex w-full items-center justify-center gap-2 py-1.5 text-xs text-azure">
              <IconLoader2 size={16} className="animate-spin" />
              <span>Transcrevendo áudio com Whisper...</span>
            </div>
          ) : (
            /* Estado padrão (repouso) */
            <>
              {/* Botão Microfone no canto esquerdo */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={disabled}
                  aria-label="Gravar áudio com a descrição"
                  title="Gravar áudio"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-[120ms] ease-brand",
                    "text-ink-muted hover:bg-surface-2 hover:text-azure",
                    "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
                  )}
                >
                  <IconMicrophone size={18} stroke={2} />
                </button>
              </div>

              {/* Lado direito: dica de atalho e botão de Enviar */}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
