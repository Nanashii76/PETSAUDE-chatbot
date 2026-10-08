import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { CopyIcon, RefreshCcwIcon, CheckIcon, PlusIcon } from 'lucide-react'

import { Action, Actions } from '@/components/ui/actions'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ui/conversation'
import { Message, MessageContent } from '@/components/ui/message'
import { LiquidPromptInput } from '@/components/ui/liquid-prompt-input'
import { RiskBadge } from '@/components/ui/risk-badge'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

import TelaIdentificacao from './TelaIdentificacao'
import Painel from './Painel'
import Regulacao from './Regulacao'
import RevisarTexto from './RevisarTexto'
import type { Mensagem, Perfil, Tela, Unidade } from './types'
import './App.css'

const API_WEBHOOK_URL =
  import.meta.env.VITE_API_WEBHOOK_URL || 'http://localhost:3000/api/webhook'
const API_BASE_URL = API_WEBHOOK_URL.replace(/\/webhook\/?$/, '')

/** Aberturas de conversa. Preenchem o campo em vez de enviar: o profissional
 *  precisa completar com os dados do paciente antes de mandar. */
const SUGESTOES: { rotulo: string; texto: string }[] = [
  {
    rotulo: 'Hipertensão de difícil controle',
    texto:
      'Paciente com hipertensão de difícil controle. Idade: . Pressão aferida: . Medicações em uso: . Exames recentes: ',
  },
  {
    rotulo: 'Lesão de pele suspeita',
    texto:
      'Paciente com lesão de pele suspeita. Localização: . Tempo de evolução: . Características da lesão: . Sintomas associados: ',
  },
  {
    rotulo: 'Nódulo de tireoide',
    texto:
      'Paciente com nódulo de tireoide em investigação. Idade: . Tamanho do nódulo: . TSH: . Ultrassonografia: ',
  },
  {
    rotulo: 'Consultar critérios da Nota Técnica',
    texto: 'Quais são os critérios para encaminhar um paciente para cardiologia?',
  },
]

function agora() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0]
}

function iniciaisDe(nome: string) {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

/** Título da conversa na lista. Sem histórico no backend, o rótulo vem do que o
 *  profissional escreveu primeiro — mesma lógica que valerá quando a API
 *  devolver conversas antigas. */
function tituloDaConversa(messages: Mensagem[]) {
  const primeira = messages.find((m) => m.sender === 'me')
  if (!primeira) return 'Nova triagem'
  const limpo = primeira.text.replace(/\s+/g, ' ').trim()
  return limpo.length > 38 ? limpo.slice(0, 38).trimEnd() + '…' : limpo
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Mensagem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [tela, setTela] = useState<Tela>('chat')
  const [revisando, setRevisando] = useState<Mensagem | null>(null)
  const [copiadoId, setCopiadoId] = useState<number | null>(null)
  const [entrada, setEntrada] = useState('')
  const campoRef = useRef<HTMLTextAreaElement>(null)

  // localStorage é síncrono, então lemos na inicialização do estado em vez de
  // num efeito. Isso evita um render extra e o flash de tela vazia que existia
  // enquanto o perfil era "undefined".
  const [userId] = useState(() => {
    let armazenado = localStorage.getItem('chat_user_id')
    if (!armazenado) {
      armazenado = 'user_' + Math.random().toString(36).slice(2, 11)
      localStorage.setItem('chat_user_id', armazenado)
    }
    return armazenado
  })

  const [perfil, setPerfil] = useState<Perfil | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('perfil') || 'null')
    } catch {
      return null
    }
  })

  async function confirmarIdentificacao({
    nome,
    unidade,
  }: {
    nome: string
    unidade: Unidade
  }) {
    await fetch(`${API_BASE_URL}/identificacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: userId, nome, unidade_cnes: unidade.cnes }),
    })
    const novoPerfil: Perfil = {
      nome,
      unidadeCnes: unidade.cnes,
      unidadeRotulo: unidade.rotulo,
    }
    localStorage.setItem('perfil', JSON.stringify(novoPerfil))
    setPerfil(novoPerfil)
  }

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
      const response = await fetch(API_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remetente_id: userId,
          mensagem: conteudo,
          origem: 'web_frontend',
        }),
      })
      const data = await response.json()

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: data.reply || 'Recebido (sem conteúdo).',
          sender: 'them',
          time: agora(),
          status: data.status,
          corRisco: data.cor_risco,
          relatoProfissional: data.relato_profissional,
          opcoes: data.opcoes || [],
        },
      ])
    } catch (error) {
      console.error('Erro na requisição:', error)
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

  /** Reenvia a última mensagem do profissional, descartando a resposta anterior. */
  function refazer() {
    const ultima = [...messages].reverse().find((m) => m.sender === 'me')
    if (!ultima || isLoading) return
    const corte = messages.findIndex((m) => m.id === ultima.id)
    setMessages(messages.slice(0, corte))
    void enviarMensagem(ultima.text)
  }

  /** Encerra a sessão ativa no backend (se houver uma PENDENTE) e limpa a conversa exibida — tanto
   *  para o botão "Nova triagem" quanto para o atalho que aparece junto do resultado de um caso
   *  finalizado. Sem o encerramento no backend, uma triagem abandonada no meio da coleta seria
   *  retomada em silêncio assim que a próxima mensagem fosse enviada. */
  async function novaTriagem() {
    if (isLoading) return
    setMessages([])
    setEntrada('')
    setRevisando(null)
    try {
      await fetch(`${API_BASE_URL}/sessao/nova`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remetente_id: userId }),
      })
    } catch (error) {
      console.error('Erro ao iniciar nova triagem:', error)
    }
  }

  async function copiar(msg: Mensagem) {
    try {
      await navigator.clipboard.writeText(msg.text)
      setCopiadoId(msg.id)
      setTimeout(() => setCopiadoId(null), 2000)
    } catch {
      setCopiadoId(null)
    }
  }

  function usarSugestao(texto: string) {
    setEntrada(texto)
    requestAnimationFrame(() => {
      const ta = campoRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    })
  }

  if (!perfil) {
    return <TelaIdentificacao apiBaseUrl={API_BASE_URL} onConfirmar={confirmarIdentificacao} />
  }

  const conversaVazia = messages.length === 0 && !isLoading
  const tituloConversa = tituloDaConversa(messages)
  const iniciais = iniciaisDe(perfil.nome)

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      {/* ---------------------------------------------------------------- aside */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-surface max-lg:w-16">
        <div className="flex items-center px-4 py-5 max-lg:justify-center max-lg:px-0">
          <Logo altura={22} className="text-ink max-lg:hidden" />
          <Logo altura={18} className="hidden text-ink max-lg:block" />
        </div>

        {/* Histórico. O backend ainda não persiste conversas anteriores, então
            por enquanto existe só a atual — mas a lista já tem a forma certa
            para receber as outras quando a API existir. */}
        <nav aria-label="Conversas" className="flex-1 overflow-y-auto px-2 max-lg:hidden">
          <button
            type="button"
            onClick={() => {
              setTela('chat')
              void novaTriagem()
            }}
            disabled={isLoading}
            className="mb-2 flex w-full items-center gap-2.5 rounded-md border border-line px-2 py-2 text-left text-[0.8125rem] font-medium text-ink transition-colors duration-[120ms] ease-brand hover:border-azure/50 hover:bg-surface-2/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="size-4 shrink-0" />
            Nova triagem
          </button>

          <p className="px-2 pb-1.5 pt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            Conversas
          </p>
          <button
            type="button"
            onClick={() => setTela('chat')}
            aria-current={tela === 'chat' ? 'page' : undefined}
            className={cn(
              'w-full truncate rounded-md px-2 py-1.5 text-left text-[0.8125rem] transition-colors duration-[120ms] ease-brand',
              tela === 'chat'
                ? 'bg-surface-2 text-ink'
                : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'
            )}
          >
            {tituloConversa}
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-line p-2">
          <button
            type="button"
            onClick={() => setTela('regulacao')}
            aria-current={tela === 'regulacao' ? 'page' : undefined}
            title="Modo Regulação"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[0.8125rem] transition-colors duration-[120ms] ease-brand',
              'max-lg:justify-center max-lg:px-0',
              tela === 'regulacao'
                ? 'bg-surface-2 text-ink'
                : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
              <path
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="max-lg:hidden">Modo Regulação</span>
          </button>

          <button
            type="button"
            onClick={() => setTela('painel')}
            aria-current={tela === 'painel' ? 'page' : undefined}
            title="Painel de uso"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[0.8125rem] transition-colors duration-[120ms] ease-brand',
              'max-lg:justify-center max-lg:px-0',
              tela === 'painel'
                ? 'bg-surface-2 text-ink'
                : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
              <path
                d="M4 19V10M10 19V5M16 19v-7M4 19h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="max-lg:hidden">Painel de uso</span>
          </button>

          <div className="flex items-center gap-2.5 rounded-md px-2 py-2 max-lg:justify-center max-lg:px-0">
            <span
              aria-hidden
              className="grid size-[26px] shrink-0 place-items-center rounded-full bg-indigo-fill text-[0.6875rem] font-semibold text-ink"
            >
              {iniciais}
            </span>
            <div className="min-w-0 flex-1 max-lg:hidden">
              <p className="truncate text-[0.8125rem] font-medium text-ink">{perfil.nome}</p>
              <p className="truncate text-[0.6875rem] text-ink-muted">{perfil.unidadeRotulo}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('perfil')
                setPerfil(null)
              }}
              className="shrink-0 text-[0.6875rem] text-ink-faint transition-colors duration-[120ms] ease-brand hover:text-azure max-lg:hidden"
            >
              Trocar
            </button>
          </div>
        </div>
      </aside>

      {/* ----------------------------------------------------------------- main */}
      {tela === 'painel' ? (
        <Painel apiBaseUrl={API_BASE_URL} onFechar={() => setTela('chat')} />
      ) : tela === 'regulacao' ? (
        <Regulacao apiBaseUrl={API_BASE_URL} userId={userId} />
      ) : (
        <main className="flex min-w-0 flex-1 flex-col">

          {conversaVazia ? (
            /* --- Estado inicial: campo grande e centralizado, com sugestões --- */
            <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 pb-10">
              <div className="w-full max-w-3xl">
                <div className="mb-6 flex flex-col items-center gap-3 text-center">
                  <div className="grid size-12 place-items-center rounded-full bg-indigo-fill/30 text-gold">
                    <svg viewBox="0 0 24 24" fill="none" className="size-6">
                      <path
                        d="M3 12h4l2-7 4 14 2-7h6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="text-balance font-serif text-[clamp(1.875rem,4vw,2.5rem)] font-bold leading-[1.15] tracking-[-0.015em] text-gold">
                    Vamos começar, {primeiroNome(perfil.nome)}
                  </h2>
                  <p className="max-w-[52ch] text-pretty text-[0.9375rem] leading-relaxed text-ink-muted">
                    Descreva o quadro clínico do paciente. Eu confiro os critérios da Nota Técnica e
                    aponto o que falta antes de gerar o texto para o SISREG.
                  </p>
                </div>

                <LiquidPromptInput
                  value={entrada}
                  onValueChange={setEntrada}
                  onSubmit={(texto) => void enviarMensagem(texto)}
                  placeholder="Descreva o quadro clínico do paciente…"
                  disabled={isLoading}
                  minHeight={96}
                  maxHeight={260}
                  inputRef={campoRef}
                />

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s.rotulo}
                      type="button"
                      onClick={() => usarSugestao(s.texto)}
                      className="rounded-full border border-line bg-surface px-3.5 py-2 text-[0.8125rem] text-ink-muted transition-colors duration-[120ms] ease-brand hover:border-azure/50 hover:text-ink"
                    >
                      {s.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* --- Conversa em andamento: campo desce e encolhe, sem divisória --- */
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
                            {/* Serifada só no que o sistema diz. O que o
                                profissional digitou é dado que ele conferiu,
                                e fica na sem serifa. */}
                            <div
                              className={cn(
                                'prose-conversa',
                                msg.sender === 'me' && 'prose-conversa-digitada'
                              )}
                            >
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>

                            {(msg.status === 'FINALIZADO' || msg.status === 'NAO_ELEGIVEL') && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
                                {msg.status === 'FINALIZADO' && msg.corRisco && (
                                  <RiskBadge cor={msg.corRisco} />
                                )}
                                {msg.status === 'FINALIZADO' && (
                                  <Button size="sm" onClick={() => setRevisando(msg)}>
                                    Revisar encaminhamento
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => void novaTriagem()}>
                                  Nova triagem
                                </Button>
                              </div>
                            )}

                            {msg.time && (
                              <span className="text-[0.6875rem] text-ink-faint">{msg.time}</span>
                            )}
                          </MessageContent>
                        </div>

                        {/* Ações só na resposta do agente. Copiar e Refazer: as duas
                            que mapeiam para algo que existe no backend. */}
                        {msg.sender === 'them' && (
                          <Actions className="pl-1">
                            <Action
                              label={copiadoId === msg.id ? 'Copiado' : 'Copiar resposta'}
                              onClick={() => void copiar(msg)}
                            >
                              {copiadoId === msg.id ? (
                                <CheckIcon className="text-risco-verde" />
                              ) : (
                                <CopyIcon />
                              )}
                            </Action>
                            {ehUltima && (
                              <Action
                                label="Refazer resposta"
                                onClick={refazer}
                                disabled={isLoading}
                              >
                                <RefreshCcwIcon />
                              </Action>
                            )}
                          </Actions>
                        )}

                        {/* Respostas rápidas: somem assim que a conversa avança, para
                            nunca deixar clicável o botão de uma pergunta velha. */}
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
                        <span className="text-[0.875rem]">Gerando resposta</span>
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
                    placeholder="Responda ou complemente o quadro…"
                    disabled={isLoading}
                    minHeight={56}
                    maxHeight={220}
                    inputRef={campoRef}
                  />
                </div>
              </div>
            </>
          )}
        </main>
      )}

      {revisando && (
        <RevisarTexto
          relato={revisando.relatoProfissional}
          textoFinal={revisando.text}
          onFechar={() => setRevisando(null)}
        />
      )}
    </div>
  )
}
