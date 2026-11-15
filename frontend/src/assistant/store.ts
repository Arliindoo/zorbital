import { createContext, useContext, useEffect } from 'react'
import type { Conversation, PageKey, Screen } from './types'

export interface AssistantValue {
  open: boolean
  docked: boolean
  setOpen: (open: boolean) => void
  setDocked: (docked: boolean) => void
  /** Sobe a cada `setOpen(true)`: é o pedido de foco na barra de comando, mesmo com o agente já aberto. */
  focusTick: number
  /** Título e página da tela atual (o que o cabeçalho do painel mostra). */
  current: Pick<Screen, 'pagina' | 'titulo'> | null
  /** A tela completa, lida só na hora de perguntar: mudar filtro não re-renderiza o painel. */
  screenRef: React.RefObject<Screen | null>
  setScreen: (screen: Screen | null) => void
  conversation: (page: PageKey) => Conversation
  saveConversation: (page: PageKey, conversation: Conversation) => void
}

export const AssistantContext = createContext<AssistantValue | null>(null)

export function useAssistant(): AssistantValue {
  const value = useContext(AssistantContext)
  if (!value) throw new Error('useAssistant fora do AssistantProvider')
  return value
}

/** Cada página informa o que está mostrando; o assistente usa isso como contexto e escopo. */
export function useScreen(screen: Screen): void {
  const { setScreen } = useAssistant()
  // sem lista de dependências: a tela muda a cada filtro, e gravar numa ref é barato
  useEffect(() => {
    setScreen(screen)
  })
  useEffect(
    () => () => {
      setScreen(null)
    },
    [setScreen],
  )
}
