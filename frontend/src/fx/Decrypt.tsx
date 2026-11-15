import { useEffect, useState } from 'react'
import { introReleased } from './intro'
import { reducedMotion } from './useInView'

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/·×+—'
const noise = (text: string) => text.replace(/\S/g, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!)

/** Texto que "decifra" da esquerda para a direita ao entrar (títulos de página). */
export function Decrypt({ text, duration = 900, delay = 80 }: { text: string; duration?: number; delay?: number }) {
  // `cut` letras já decifradas; `scramble` é a janela curta de ruído logo depois delas
  const [state, setState] = useState<{ cut: number; scramble: string } | null>(() => (reducedMotion() ? null : { cut: 0, scramble: '' }))
  useEffect(() => {
    if (reducedMotion()) return
    let frame = 0
    let cancelled = false
    let start = 0
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      if (t >= 1) {
        setState(null)
        return
      }
      const cut = Math.floor(t * text.length)
      setState({ cut, scramble: noise(text.slice(cut, cut + 6)) })
      frame = requestAnimationFrame(tick)
    }
    // espera a abertura da logo liberar a tela (fx/intro.ts)
    introReleased.then(() => {
      if (cancelled) return
      start = performance.now() + delay
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [text, duration, delay])

  if (!state) return <>{text}</>
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, state.cut)}
        <span style={{ color: 'var(--signal)', fontFamily: 'var(--mono)', fontSize: '0.86em' }}>{state.scramble}</span>
      </span>
    </>
  )
}
