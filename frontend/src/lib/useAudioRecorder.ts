import * as React from "react"

export interface UseAudioRecorderOptions {
  onTranscriptionSuccess?: (text: string) => void
  onTranscriptionError?: (error: string) => void
  apiBaseUrl?: string
}

export type RecordingState = "idle" | "recording" | "transcribing"

export interface UseAudioRecorderReturn {
  state: RecordingState
  durationSeconds: number
  volumeLevel: number // 0 a 1 normalizado
  errorMessage: string | null
  startRecording: () => Promise<void>
  stopAndTranscribe: () => void
  cancelRecording: () => void
  clearError: () => void
}

export function useAudioRecorder({
  onTranscriptionSuccess,
  onTranscriptionError,
  apiBaseUrl = "",
}: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const [state, setState] = React.useState<RecordingState>("idle")
  const [durationSeconds, setDurationSeconds] = React.useState(0)
  const [volumeLevel, setVolumeLevel] = React.useState(0)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const audioChunksRef = React.useRef<Blob[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const timerRef = React.useRef<number | null>(null)
  const audioContextRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const animFrameRef = React.useRef<number | null>(null)
  const isCancelledRef = React.useRef(false)

  // Limpa recursos de áudio e microfone
  const cleanup = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    mediaRecorderRef.current = null
    setVolumeLevel(0)
  }, [])

  React.useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // Inicia animação para ler volume em tempo real
  const updateVolume = React.useCallback(() => {
    function loop() {
      if (!analyserRef.current) return
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]
      }
      const average = sum / dataArray.length
      // Normaliza de 0 a 1 com curva suave
      const normalized = Math.min(1, Math.max(0, average / 128))
      setVolumeLevel(normalized)

      animFrameRef.current = requestAnimationFrame(loop)
    }

    loop()
  }, [])

  const startRecording = React.useCallback(async () => {
    try {
      setErrorMessage(null)
      isCancelledRef.current = false
      audioChunksRef.current = []

      // Verifica suporte no navegador
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const msg = "Seu navegador não suporta captura de microfone."
        setErrorMessage(msg)
        onTranscriptionError?.(msg)
        return
      }

      // Solicita permissão do microfone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // Configura AudioContext para análise de volume/onda
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioCtx = new AudioCtx()
        audioContextRef.current = audioCtx
        const sourceNode = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        sourceNode.connect(analyser)
        analyserRef.current = analyser
        updateVolume()
      } catch (err) {
        console.warn("[useAudioRecorder] AudioContext indisponível para visualização de volume:", err)
      }

      // Determina MIME type compatível
      let mimeType = "audio/webm;codecs=opus"
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm"
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4"
        } else {
          mimeType = ""
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current
        const wasCancelled = isCancelledRef.current
        cleanup()

        if (wasCancelled || chunks.length === 0) {
          setState("idle")
          setDurationSeconds(0)
          return
        }

        const actualMime = chunks[0]?.type || recorder.mimeType || "audio/webm"
        const blob = new Blob(chunks, { type: actualMime })

        // Se o áudio gravado for minúsculo (ex: clique acidental < 0.4s)
        if (blob.size < 200) {
          setState("idle")
          setDurationSeconds(0)
          return
        }

        setState("transcribing")

        try {
          const formData = new FormData()
          const ext = actualMime.includes("mp4") ? "m4a" : "webm"
          formData.append("audio", blob, `gravacao.${ext}`)

          const targetUrl = apiBaseUrl ? `${apiBaseUrl}/transcrever-audio` : "/api/transcrever-audio"
          const res = await fetch(targetUrl, {
            method: "POST",
            body: formData,
          })

          const data = (await res.json()) as { success?: boolean; text?: string; error?: string }

          if (!res.ok || !data.success) {
            throw new Error(data.error || "Erro ao transcrever o áudio.")
          }

          const textoTranscrito = (data.text || "").trim()
          if (!textoTranscrito) {
            setErrorMessage("Nenhuma fala compreensível identificada.")
            onTranscriptionError?.("Nenhuma fala compreensível identificada.")
          } else {
            onTranscriptionSuccess?.(textoTranscrito)
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Falha na transcrição do áudio."
          setErrorMessage(msg)
          onTranscriptionError?.(msg)
        } finally {
          setState("idle")
          setDurationSeconds(0)
        }
      }

      recorder.start(250) // coleta a cada 250ms
      setState("recording")
      setDurationSeconds(0)

      timerRef.current = window.setInterval(() => {
        setDurationSeconds((s) => s + 1)
      }, 1000)
    } catch (err: unknown) {
      cleanup()
      setState("idle")
      const domErr = err as { name?: string; message?: string }
      let msg = "Não foi possível acessar o microfone."
      if (domErr?.name === "NotAllowedError" || domErr?.name === "PermissionDeniedError") {
        msg = "Permissão do microfone negada. Conceda acesso nas configurações do navegador."
      } else if (domErr?.name === "NotFoundError" || domErr?.name === "DevicesNotFoundError") {
        msg = "Nenhum microfone encontrado neste dispositivo."
      }
      setErrorMessage(msg)
      onTranscriptionError?.(msg)
    }
  }, [apiBaseUrl, cleanup, onTranscriptionError, onTranscriptionSuccess, updateVolume])

  const stopAndTranscribe = React.useCallback(() => {
    isCancelledRef.current = false
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const cancelRecording = React.useCallback(() => {
    isCancelledRef.current = true
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    } else {
      cleanup()
      setState("idle")
      setDurationSeconds(0)
    }
  }, [cleanup])

  const clearError = React.useCallback(() => {
    setErrorMessage(null)
  }, [])

  return {
    state,
    durationSeconds,
    volumeLevel,
    errorMessage,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    clearError,
  }
}
