import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { session, storage } from '@/lib/storage'
import { AssistantContext, type AssistantValue } from './store'
import type { Conversation, PageKey, Screen } from './types'

const EMPTY: Conversation = { api: [], view: [] }

/**
 * Aberto/expandido valem para todas as páginas e sobrevivem a recarregar (localStorage); a conversa é
 * guardada por página e some ao fechar a aba (sessionStorage). `docked` é o painel de resposta largo.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(() => storage.get<boolean>('assistente_aberto') ?? false)
  const [docked, setDockedState] = useState(() => storage.get<boolean>('assistente_lateral') ?? false)
  const [current, setCurrent] = useState<AssistantValue['current']>(null)
  const [conversations, setConversations] = useState<Partial<Record<PageKey, Conversation>>>(
    () => session.get('conversas') ?? {},
  )
  const [focusTick, setFocusTick] = useState(0)
  const screenRef = useRef<Screen | null>(null)

  const setOpen = useCallback((value: boolean) => {
    setOpenState(value)
    if (value) setFocusTick((n) => n + 1)
    storage.set('assistente_aberto', value)
  }, [])
  const setDocked = useCallback((value: boolean) => {
    setDockedState(value)
    storage.set('assistente_lateral', value)
  }, [])
  const setScreen = useCallback((screen: Screen | null) => {
    screenRef.current = screen
    setCurrent((prev) =>
      prev?.pagina === screen?.pagina && prev?.titulo === screen?.titulo
        ? prev
        : screen && { pagina: screen.pagina, titulo: screen.titulo },
    )
  }, [])
  const conversation = useCallback((page: PageKey) => conversations[page] ?? EMPTY, [conversations])
  const saveConversation = useCallback((page: PageKey, value: Conversation) => {
    setConversations((all) => {
      const next = { ...all, [page]: value }
      session.set('conversas', next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      open,
      docked,
      setOpen,
      setDocked,
      focusTick,
      current,
      screenRef,
      setScreen,
      conversation,
      saveConversation,
    }),
    [open, docked, setOpen, setDocked, focusTick, current, setScreen, conversation, saveConversation],
  )
  return <AssistantContext value={value}>{children}</AssistantContext>
}
