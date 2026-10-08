export type Remetente = "me" | "them" | "system"

export type CorRisco = "Vermelha" | "Amarela" | "Verde" | "Azul"

export type Mensagem = {
  id: number
  text: string
  sender: Remetente
  time: string
  /** Só vem preenchido quando o caso fecha */
  status?: "FINALIZADO" | "PENDENTE" | "NAO_ELEGIVEL"
  corRisco?: CorRisco
  relatoProfissional?: string
  /** Respostas rápidas; só clicáveis na última mensagem */
  opcoes?: string[]
}

export type Unidade = {
  cnes: string
  nome?: string
  ra?: string | null
  regiao?: string | null
  rotulo: string
}

export type Perfil = {
  nome: string
  unidadeCnes: string
  unidadeRotulo: string
}

export type Tela = "chat" | "painel" | "regulacao"

export type LinhaEspecialidade = {
  especialidade: string
  casos: number
  textos: number
  naoElegiveis: number
}

export type LinhaLugar = { nome: string; casos: number }

export type DadosPainel = {
  periodo: string
  casos: number
  textos: number
  naoElegiveis: number
  urgencias: number
  cores: Record<string, number>
  especialidades: LinhaEspecialidade[]
  unidades: LinhaLugar[]
  regioes: LinhaLugar[]
}

/** Mensagem do Modo Regulação — fluxo independente do chat de encaminhamento (sem bolha
 *  de status FINALIZADO/selo de risco: cada mensagem é uma análise isolada). */
export type MensagemRegulacao = {
  id: number
  text: string
  sender: "me" | "them" | "system"
  time: string
  opcoes?: string[]
  /** Texto fixo (devolução) pronto para copiar, quando a resposta trouxer um. */
  copiavel?: string | null
}

/** Linha da lista de encaminhamentos gerados, exibida no painel (sem o texto completo —
 *  ver DetalheEncaminhamento, buscado sob demanda ao abrir um item). */
export type ResumoEncaminhamento = {
  id: string
  sessaoId: string
  especialidade: string
  classificacaoRisco: CorRisco | null
  elegivel: boolean
  criadoEm: string
  profissional: string
  unidade: string
}

export type DetalheEncaminhamento = {
  id: string
  especialidade: string
  classificacaoRisco: CorRisco | null
  elegivel: boolean
  criadoEm: string
  resumoSisreg: string
}
