import * as React from "react"

export interface UseDocumentUploadOptions {
  onExtractionSuccess?: (texto: string, nomeArquivo: string, truncado: boolean) => void
  onExtractionError?: (error: string) => void
  apiBaseUrl?: string
}

export type DocumentUploadState = "idle" | "uploading"

export interface UseDocumentUploadReturn {
  state: DocumentUploadState
  errorMessage: string | null
  /** Abre o seletor de arquivo do navegador (PDF). */
  pickFile: () => void
  clearError: () => void
  /** Props do <input type="file"> oculto que o componente precisa renderizar. */
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>
    type: "file"
    accept: "application/pdf"
    className: "hidden"
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  }
}

/**
 * Upload de um documento (hoje: só PDF) para extração de texto no backend. Mesmo padrão de
 * useAudioRecorder.ts (transcrição): o conteúdo extraído vira rascunho no campo de texto para o
 * profissional revisar antes de enviar — nunca é enviado automaticamente.
 */
export function useDocumentUpload({
  onExtractionSuccess,
  onExtractionError,
  apiBaseUrl = "",
}: UseDocumentUploadOptions = {}): UseDocumentUploadReturn {
  const [state, setState] = React.useState<DocumentUploadState>("idle")
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const pickFile = React.useCallback(() => {
    inputRef.current?.click()
  }, [])

  const clearError = React.useCallback(() => {
    setErrorMessage(null)
  }, [])

  const handleChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Limpa o input imediatamente: permite escolher o mesmo arquivo de novo depois de um erro.
      e.target.value = ""
      if (!file) return

      setErrorMessage(null)
      setState("uploading")

      try {
        const formData = new FormData()
        formData.append("documento", file, file.name)

        const targetUrl = apiBaseUrl ? `${apiBaseUrl}/documento/extrair` : "/api/documento/extrair"
        const res = await fetch(targetUrl, { method: "POST", body: formData })

        const data = (await res.json()) as {
          success?: boolean
          texto?: string
          truncado?: boolean
          nomeArquivo?: string
          error?: string
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Erro ao processar o documento.")
        }

        const texto = (data.texto || "").trim()
        if (!texto) {
          const msg = "Não foi possível extrair texto deste documento."
          setErrorMessage(msg)
          onExtractionError?.(msg)
        } else {
          onExtractionSuccess?.(texto, data.nomeArquivo || file.name, !!data.truncado)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Falha ao processar o documento."
        setErrorMessage(msg)
        onExtractionError?.(msg)
      } finally {
        setState("idle")
      }
    },
    [apiBaseUrl, onExtractionError, onExtractionSuccess]
  )

  return {
    state,
    errorMessage,
    pickFile,
    clearError,
    inputProps: {
      ref: inputRef,
      type: "file",
      accept: "application/pdf",
      className: "hidden",
      onChange: handleChange,
    },
  }
}
