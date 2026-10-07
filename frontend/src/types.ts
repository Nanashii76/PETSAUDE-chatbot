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

export type Tela = "chat" | "painel"

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
