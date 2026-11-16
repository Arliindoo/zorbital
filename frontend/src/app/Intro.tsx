import { useLayoutEffect, useRef, useState } from 'react'
import { releaseIntro } from '@/shared/fx/intro'
import { reducedMotion } from '@/shared/fx/useInView'
import { Wordmark } from '@/shared/ui/Brand'

const EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const POWER3_OUT = 'cubic-bezier(0.165, 0.84, 0.44, 1)'
const POWER3_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'

/** Cena 1 · nome: as letras sobem das máscaras em sequência enquanto a palavra se fecha (ms). */
const WORD = { at: 200, rise: 600, stagger: 90, breathe: 1000 }
/** Quanto cada letra nasce afastada da vizinha, em unidades do desenho (~0,14em). */
const SPREAD = 17
/** Cena 2 · cortina: início e duração de cada folha, da frente para o fundo (ms). */
const CURTAIN = [
  { panel: '.intro__panel--void', at: 0, duration: 600 },
  { panel: '.intro__panel--magenta', at: 120, duration: 600 },
  { panel: '.intro__panel--ink', at: 240, duration: 800 },
]
/** O painel começa a própria entrada com a última folha já a meio caminho. */
const RELEASE_AT = 700

// Teclas que rolam a página. Durante a abertura elas só a adiantam.
const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'])

/**
 * Abertura em duas cenas, no modelo da cerimônia de entrada do site da Zyria.
 *
 * Cena 1 · nome: ZORBITAL sobe letra a letra de dentro de uma máscara e a palavra "respira",
 * nascendo espaçada e fechando até o desenho final.
 * Cena 2 · cortina: sem pausa, três folhas de tela cheia (preta com o nome → magenta →
 * tinta clara) sobem escalonadas e descobrem o painel.
 *
 * Toca em todo carregamento; clique ou tecla adiantam a cortina. Com movimento reduzido não existe.
 */
export function Intro() {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(() => !reducedMotion())

  useLayoutEffect(() => {
    const el = root.current
    if (!el) {
      releaseIntro()
      return
    }
    const html = document.documentElement
    const letters = [...el.querySelectorAll<SVGGElement>('.wordmark g')]

    const running: Animation[] = []
    const play = (target: Element, keyframes: PropertyIndexedKeyframes, options: KeyframeAnimationOptions) => {
      const animation = target.animate(keyframes, { fill: 'both', ...options })
      running.push(animation)
      return animation
    }
    // As esperas também são animações (vazias): tudo corre no mesmo relógio, então a abertura
    // não sai de sincronia se a aba ficar em segundo plano. Cancelada, a espera não dispara.
    const after = (ms: number, then: () => void) => {
      play(el, {}, { duration: ms }).finished.then(then, () => {})
    }

    let ended = false
    let lifting = false
    const block = (event: Event) => event.preventDefault()
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) event.preventDefault()
      curtain()
    }
    const teardown = () => {
      ended = true
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', block)
      window.removeEventListener('touchmove', block)
      delete html.dataset.intro
    }
    const release = () => {
      if (ended) return
      releaseIntro()
      html.dataset.intro = 'released'
    }
    const end = () => {
      if (ended) return
      teardown()
      releaseIntro()
      setActive(false)
    }

    html.dataset.intro = 'playing'

    // Cena 1 · nome
    const middle = (letters.length - 1) / 2
    letters.forEach((letter, i) => {
      play(letter.firstElementChild!, { transform: ['translateY(96px)', 'translateY(0)'] }, { duration: WORD.rise, delay: WORD.at + i * WORD.stagger, easing: EXPO_OUT })
      play(letter, { transform: [`translateX(${(i - middle) * SPREAD}px)`, 'translateX(0)'] }, { duration: WORD.breathe, delay: WORD.at, easing: POWER3_OUT })
    })

    // Cena 2 · cortina: emenda na última letra assentada, sem respiro. O nome sobe com a folha preta.
    function curtain() {
      if (lifting || ended) return
      lifting = true
      for (const { panel, at, duration } of CURTAIN) {
        play(el!.querySelector(panel)!, { transform: ['translateY(0)', 'translateY(-100%)'] }, { duration, delay: at, easing: POWER3_IN_OUT })
      }
      after(RELEASE_AT, release)
      after(Math.max(...CURTAIN.map(({ at, duration }) => at + duration)), end)
    }
    after(WORD.at + (letters.length - 1) * WORD.stagger + WORD.rise, curtain)

    // clique ou tecla adiantam a cortina; roda e toque não rolam a página por baixo da abertura
    el.addEventListener('pointerdown', curtain)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', block, { passive: false })
    window.addEventListener('touchmove', block, { passive: false })

    return () => {
      teardown()
      for (const animation of running) animation.cancel()
    }
  }, [])

  if (!active) return null
  return (
    <div ref={root} className="intro sim-dark" aria-hidden>
      <div className="intro__panel intro__panel--ink" />
      <div className="intro__panel intro__panel--magenta" />
      <div className="intro__panel intro__panel--void">
        <Wordmark room={4 * SPREAD} />
      </div>
    </div>
  )
}
