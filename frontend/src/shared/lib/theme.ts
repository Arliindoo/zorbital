import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { storage } from '@/shared/lib/storage'

export type Theme = 'dark' | 'light'

/** Cor da barra do navegador em cada tema (igual a --void). */
const CHROME: Record<Theme, string> = { dark: '#000000', light: '#f1f0ea' }
const listeners = new Set<() => void>()

// O tema inicial já foi posto em <html data-theme> por um script em index.html, antes da primeira
// pintura; aqui só lemos o que está lá.
const current = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme])
  storage.set('theme', theme)
  for (const notify of listeners) notify()
}

/**
 * Troca o tema. Com `origin` (o centro do botão), o tema novo se abre em círculo a partir dali,
 * por View Transition; sem suporte, ou com movimento reduzido, a troca é direta.
 */
export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  if (theme === current()) return
  const root = document.documentElement
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!origin || still || !document.startViewTransition) return apply(theme)

  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
  root.style.setProperty('--theme-x', `${origin.x}px`)
  root.style.setProperty('--theme-y', `${origin.y}px`)
  root.style.setProperty('--theme-r', `${radius}px`)
  root.dataset.themeSwitch = ''
  const transition = document.startViewTransition(() => flushSync(() => apply(theme)))
  void transition.finished.finally(() => delete root.dataset.themeSwitch)
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    current,
    () => 'dark' as const,
  )
}
