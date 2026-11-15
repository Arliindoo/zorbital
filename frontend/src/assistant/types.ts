import type { Row } from '@/api/types'

/** Chaves de página do assistente (as mesmas de tools.PAGE_GROUPS no back-end). */
export type PageKey = 'overview' | 'flex' | 'bass' | 'psi117' | 'cfi' | 'psi142' | 'comparacao' | 'estudos' | 'fichas' | 'explore'

type FilterValue = string | number | boolean | null | readonly (string | number)[] | readonly [number, number]

/** O que a página mostra agora (espelho de `assistant.screen.Screen`). */
export interface Screen {
  pagina: PageKey
  titulo: string
  investigacao?: string | null
  escopo?: string[] | null
  filtros?: Record<string, FilterValue>
  graficos?: string[]
  /** Linhas já filtradas: é delas que saem as respostas sobre "o que está na tela". */
  dados?: readonly Row[] | null
  colunas?: string[] | null
  tabela_banco?: string | null
}

/** Mensagem no formato da API da OpenAI; o servidor monta, o navegador só guarda e devolve. */
export type ApiMessage = Record<string, unknown>

/** Bloco da página que o agente tinha à vista ao responder (vem de `data-agent-*`). */
export interface Source {
  id: string
  kind: string
  label: string
}

/** Ficha de um estudo (investigação da NASA) envolvido na página, como o servidor a leu para o agente. */
export interface Study {
  id: string
  nome: string
  categoria: string
  ambiente: string
  tipo_evidencia: string
  pergunta: string
  cautelas: string
  url_nasa: string | null
  relatorio: string | null
  doi: string | null
  fonte_carregada: string | null
}

/** O que a tela mandava junto com a pergunta, em números (o "recibo" da etapa Ler a tela). */
export interface ScreenDigest {
  blocos: number
  graficos: number
  linhas: number | null
  filtros: number
}

export interface ViewMessage {
  role: 'user' | 'assistant'
  text: string
  tools?: string[]
  /** Para cada consulta de `tools`, se ela foi à ficha de um estudo (cautelas, origem, catálogo). */
  studyTools?: boolean[]
  /** Estudos cuja ficha o agente leu neste turno. */
  studies?: Study[]
  error?: string
  /** Custo do turno em ZYT (só quando o servidor informa). */
  cost?: number | null
  /** Duração do turno, em ms. */
  ms?: number
  sources?: Source[]
  digest?: ScreenDigest
  /** Hora em que a pergunta foi feita (epoch ms). */
  at?: number
}

export interface Conversation {
  api: ApiMessage[]
  view: ViewMessage[]
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'studies'; items: Study[] }
  | { type: 'tool'; label: string; name?: string; group?: string | null; study?: boolean }
  | { type: 'done'; cost: number | null; history: ApiMessage[] }
  | { type: 'error'; message: string }
