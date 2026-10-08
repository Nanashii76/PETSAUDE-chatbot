import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { CopyIcon, CheckIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ui/conversation'
import { Message, MessageContent } from '@/components/ui/message'
import { LiquidPromptInput } from '@/components/ui/liquid-prompt-input'
import { cn } from '@/lib/utils'
import type { MensagemRegulacao } from './types'

function agora() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Modo Regulação: analisa um pedido de encaminhamento já recebido (ou responde uma consulta de
 * critérios) — o inverso do chat principal, que conversa coletando dados do lado da APS. Cada
 * mensagem aqui é uma análise isolada, por isso não há selo de risco nem "Revisar encaminhamento":
 * quando a resposta trouxer um texto pronto para copiar (ex: devolução), ele vem em `copiavel`.
 */
export default function Regulacao({
  apiBaseUrl,
  userId,
}: {
  apiBaseUrl: string
  userId: string
}) {
  const [messages, setMessages] = useState<MensagemRegulacao[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [entrada, setEntrada] = useState('')
  const [copiadoId, setCopiadoId] = useState<number | null>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)

  async function enviarMensagem(texto: string) {
    const conteudo = texto.trim()
    if (!conteudo || isLoading) return

    setEntrada('')
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), text: conteudo, sender: 'me', time: agora() },
    ])
    setIsLoading(true)

    try {
      const response = await fetch(`${apiBaseUrl}/regulacao/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remetente_id: userId, mensagem: conteudo }),
      })
      const data = await response.json()

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: data.reply || 'Recebido (sem conteúdo).',
          sender: 'them',
          time: agora(),
          opcoes: data.opcoes || [],
          copiavel: data.copiavel || null,
        },
      ])
    } catch (error) {
      console.error('Erro na requisição da Regulação:', error)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          text: 'Não foi possível falar com o servidor da Regulação. Verifique a conexão e tente enviar de novo.',
          sender: 'system',
          time: '',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  async function copiar(msg: MensagemRegulacao) {
    const texto = msg.copiavel ?? msg.text
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoId(msg.id)
      setTimeout(() => setCopiadoId(null), 2000)
    } catch {
      setCopiadoId(null)
    }
  }

  const conversaVazia = messages.length === 0 && !isLoading

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {conversaVazia ? (
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 pb-10">
          <div className="w-full max-w-3xl">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <h2 className="text-balance font-serif text-[clamp(1.875rem,4vw,2.5rem)] font-bold leading-[1.15] tracking-[-0.015em] text-gold">
                Modo Regulação
              </h2>
              <p className="max-w-[56ch] text-pretty text-[0.9375rem] leading-relaxed text-ink-muted">
                Cole o texto de um encaminhamento recebido para eu conferir os critérios e o
                conteúdo mínimo da Nota Técnica, ou pergunte algo como "quais os critérios para
                hipertensão?". A decisão final é sempre sua.
              </p>
            </div>

            <LiquidPromptInput
              value={entrada}
              onValueChange={setEntrada}
              onSubmit={(texto) => void enviarMensagem(texto)}
              placeholder="Cole o encaminhamento ou faça uma pergunta…"
              disabled={isLoading}
              minHeight={96}
              maxHeight={260}
              inputRef={campoRef}
              ariaLabel="Mensagem para o Modo Regulação"
            />
          </div>
        </div>
      ) : (
        <>
          <Conversation>
            <ConversationContent>
              {messages.map((msg, idx) => {
                const ehUltima = idx === messages.length - 1
                const from =
                  msg.sender === 'me' ? 'user' : msg.sender === 'system' ? 'system' : 'assistant'

                return (
                  <Message key={msg.id} from={from} className="flex-col items-stretch gap-1.5">
                    <div
                      className={cn(
                        'flex w-full',
                        msg.sender === 'me' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <MessageContent
                        className={cn(
                          msg.sender === 'system' &&
                            'border border-risco-vermelha/35 bg-[color-mix(in_oklch,var(--risco-vermelha)_12%,var(--bg))] text-ink'
                        )}
                      >
                        <div
                          className={cn(
                            'prose-conversa',
                            msg.sender === 'me' && 'prose-conversa-digitada'
                          )}
                        >
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>

                        {msg.copiavel && (
                          <div className="mt-1 flex flex-col gap-2 border-t border-line/60 pt-2.5">
                            <div className="whitespace-pre-wrap rounded-lg border border-line bg-[var(--surface-input)] p-3 font-mono text-[0.8125rem] leading-relaxed text-ink">
                              {msg.copiavel}
                            </div>
                            <Button size="sm" className="self-start" onClick={() => void copiar(msg)}>
                              {copiadoId === msg.id ? (
                                <>
                                  <CheckIcon /> Copiado
                                </>
                              ) : (
                                <>
                                  <CopyIcon /> Copiar texto da devolução
                                </>
                              )}
                            </Button>
                          </div>
                        )}

                        {msg.time && (
                          <span className="text-[0.6875rem] text-ink-faint">{msg.time}</span>
                        )}
                      </MessageContent>
                    </div>

                    {msg.opcoes && msg.opcoes.length > 0 && ehUltima && !isLoading && (
                      <div className="flex flex-wrap gap-2 pl-1 pt-0.5">
                        {msg.opcoes.map((opcao) => (
                          <Button
                            key={opcao}
                            variant="outline"
                            size="sm"
                            onClick={() => void enviarMensagem(opcao)}
                          >
                            {opcao}
                          </Button>
                        ))}
                      </div>
                    )}
                  </Message>
                )
              })}

              {isLoading && (
                <Message from="assistant">
                  <MessageContent className="flex-row items-center gap-2 text-ink-muted">
                    <span className="text-[0.875rem]">Analisando</span>
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="size-1.5 animate-pulse rounded-full bg-ink-faint"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </span>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="shrink-0 px-5 pb-4">
            <div className="mx-auto w-full max-w-3xl">
              <LiquidPromptInput
                value={entrada}
                onValueChange={setEntrada}
                onSubmit={(texto) => void enviarMensagem(texto)}
                placeholder="Cole outro encaminhamento ou pergunte…"
                disabled={isLoading}
                minHeight={56}
                maxHeight={220}
                inputRef={campoRef}
                ariaLabel="Mensagem para o Modo Regulação"
              />
            </div>
          </div>
        </>
      )}
    </main>
  )
}
