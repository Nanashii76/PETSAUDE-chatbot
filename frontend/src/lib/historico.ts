import type { Mensagem } from '@/types'

/** Histórico de conversas salvo só neste navegador (localStorage) — não há login, então é o que
 *  permite reabrir conversas passadas. As datas saem dos próprios ids das mensagens (Date.now()),
 *  sem campo extra para manter em sincronia. */
export type Conversa = {
  id: string
  mensagens: Mensagem[]
}

const CHAVE_CONVERSAS = 'historico_conversas'
const CHAVE_ATUAL = 'conversa_atual_id'

/** Teto de conversas guardadas — o texto dos casos fica no navegador, então não acumula sem fim. */
export const LIMITE_CONVERSAS = 50

export function novoIdConversa(): string {
  return crypto.randomUUID()
}

export function atualizadaEm(conversa: Conversa): number {
  return Math.max(0, ...conversa.mensagens.map((m) => m.id))
}

export function carregarHistorico(): { atual: Conversa; anteriores: Conversa[] } {
  let conversas: Conversa[] = []
  let idAtual: string | null = null
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_CONVERSAS) || '[]')
    if (Array.isArray(bruto)) {
      conversas = bruto.filter(
        (c): c is Conversa => !!c && typeof c.id === 'string' && Array.isArray(c.mensagens)
      )
    }
    idAtual = localStorage.getItem(CHAVE_ATUAL)
  } catch {
    // Storage bloqueado ou JSON corrompido: começa do zero em vez de quebrar a tela.
  }

  const atual = conversas.find((c) => c.id === idAtual) ?? { id: idAtual || novoIdConversa(), mensagens: [] }
  const anteriores = conversas
    .filter((c) => c.id !== atual.id && c.mensagens.length > 0)
    .sort((a, b) => atualizadaEm(b) - atualizadaEm(a))
  return { atual, anteriores }
}

export function salvarHistorico(atual: Conversa, anteriores: Conversa[]) {
  const conversas = (atual.mensagens.length > 0 ? [atual, ...anteriores] : anteriores).slice(
    0,
    LIMITE_CONVERSAS
  )
  try {
    localStorage.setItem(CHAVE_ATUAL, atual.id)
    localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas))
  } catch {
    // Cota estourada: tenta de novo só com a metade mais recente antes de desistir.
    try {
      localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(conversas.slice(0, Math.ceil(conversas.length / 2))))
    } catch {
      // Sem storage disponível — o histórico simplesmente não persiste nesta sessão.
    }
  }
}

/** Título na lista: o começo do que o profissional escreveu primeiro. */
export function tituloDaConversa(messages: Mensagem[]) {
  const primeira = messages.find((m) => m.sender === 'me')
  if (!primeira) return 'Nova triagem'
  const limpo = primeira.text.replace(/\s+/g, ' ').trim()
  return limpo.length > 38 ? limpo.slice(0, 38).trimEnd() + '…' : limpo
}

export function formatarDataConversa(conversa: Conversa) {
  return new Date(atualizadaEm(conversa)).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
