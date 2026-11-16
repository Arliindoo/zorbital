/**
 * Diretor da simulação: o laço de desenho, a câmera, a troca de cenas e o relógio do ensaio.
 * Vive fora do React (60 quadros por segundo não passam por `setState`); a tela recebe só
 * um "tique" resumido algumas vezes por segundo.
 *
 * Desempenho: o laço para quando a aba está oculta ou o canvas sai da tela; a resolução interna
 * cai se o quadro passar de ~24 ms e volta quando sobra folga; com "reduzir movimento" o desenho
 * é sob demanda.
 */

import { type Pose, type Projected, Renderer } from '@/visualization/engine/renderer'
import { clamp, ease, lerp, type V3 } from '@/visualization/engine/vec'
import type { Dim, Frame, Hotspot, Scene, SimRun, SimStudy, StageDef, View } from '@/visualization/types'

export interface Tick {
  t: number
  playing: boolean
  ended: boolean
}

export interface DirectorHooks {
  onTick(tick: Tick): void
  /** a cena visível mudou (no meio da transição) */
  onStage(id: string, hotspots: readonly Hotspot[]): void
  /** a reprodução chegou ao fim */
  onEnded(): void
  /** a pessoa mexeu na cena (encerra o percurso guiado e a dica) */
  onInput(): void
  onError(message: string): void
}

/** Elementos de DOM que o diretor posiciona a cada quadro; a tela os registra aqui. */
export interface Overlay {
  hot: Map<string, HTMLElement>
  dims: (HTMLElement | null)[]
}

interface MutablePose {
  target: [number, number, number]
  yaw: number
  pitch: number
  dist: number
}

interface Tween {
  from: Pose
  to: Pose
  t0: number
  dur: number
}

interface Swap {
  next: string
  phase: 'out' | 'in'
  t0: number
  /** entrando (aproxima) ou saindo (afasta) */
  inward: boolean
}

const OUT_S = 0.42
const IN_S = 0.55
const MAX_DPR = 2
const MIN_QUALITY = 0.6
const WIDE_CENTER = [0.5, 0.48] as const
const NARROW_CENTER = [0.5, 0.6] as const

const copy = (p: Pose): MutablePose => ({ target: [p.target[0], p.target[1], p.target[2]], yaw: p.yaw, pitch: p.pitch, dist: p.dist })

export class Director<S> {
  private r!: Renderer
  private study: SimStudy<S>
  private stage: StageDef<S>
  private scene!: Scene<S>
  private scenes = new Map<string, Scene<S>>()
  private seen = new Set<string>()
  private pose: MutablePose = { target: [0, 0, 0], yaw: 0, pitch: 0, dist: 10 }
  private tween: Tween | null = null
  private swap: Swap | null = null
  private alpha = 1
  private born = 0
  private revealFor = 1.9

  private run: SimRun<S> | null = null
  private t = 0
  private playing = false
  private ended = false
  private speed = 1

  private raf = 0
  private last = 0
  private now = 0
  private lastTick = 0
  private visible = true
  private lost = false
  private autoRotate = true
  private lastInput = -10
  private focus: string | null = null
  private still: boolean
  private quality = 1
  private slowFor = 0
  private fastFor = 0
  private ema = 1 / 60
  private sized = false

  private dimText = new WeakMap<HTMLElement, string>()
  private pointers = new Map<number, { x: number; y: number }>()
  private pinch = 0
  /** a roda do mouse só aproxima depois que a pessoa clicou na cena (antes disso, rola a página) */
  private engaged = false
  private tmp: Projected = { x: 0, y: 0, scale: 1, depth: 1, front: true }
  private frameCtx: Frame<S>
  private cleanup: (() => void)[] = []
  private readonly canvas: HTMLCanvasElement
  private readonly hooks: DirectorHooks
  private readonly overlay: Overlay

  constructor(canvas: HTMLCanvasElement, overlay: Overlay, study: SimStudy<S>, stageId: string, hooks: DirectorHooks) {
    this.canvas = canvas
    this.overlay = overlay
    this.hooks = hooks
    this.study = study
    this.stage = study.stages.find((s) => s.id === stageId) ?? study.stages[0]!
    this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.frameCtx = { r: null as unknown as Renderer, run: null, t: 0, live: false, now: 0, dt: 0, reveal: 1, alpha: 1, focus: null, still: this.still }
    this.boot()
    this.listen()
  }

  // ---------- montagem --------------------------------------------------------------------------

  private boot(): void {
    try {
      this.r = new Renderer(this.canvas)
    } catch (error) {
      this.lost = true
      this.hooks.onError(error instanceof Error ? error.message : String(error))
      return
    }
    this.frameCtx.r = this.r
    this.scenes.clear()
    this.enter(this.stage, performance.now() / 1000)
    this.pose = copy(this.view().pose)
    this.schedule()
  }

  private sceneFor(stage: StageDef<S>): Scene<S> {
    let scene = this.scenes.get(stage.sceneKey)
    if (!scene) {
      scene = stage.scene(this.r)
      this.scenes.set(stage.sceneKey, scene)
    }
    return scene
  }

  private view(): View {
    return this.scene.views[this.stage.view] ?? Object.values(this.scene.views)[0]!
  }

  private enter(stage: StageDef<S>, now: number): void {
    const sameScene = this.scene && stage.sceneKey === this.stage.sceneKey
    this.stage = stage
    this.scene = this.sceneFor(stage)
    if (!sameScene) {
      this.born = now
      this.revealFor = this.seen.has(stage.sceneKey) ? 0.7 : 1.9
      this.seen.add(stage.sceneKey)
    }
    this.focus = null
    // ao chegar no experimento, a reprodução começa sozinha (do início, se já tinha terminado)
    if (stage.experiment && this.run?.playable) {
      if (this.ended) {
        this.t = this.run.start
        this.ended = false
      }
      this.playing = true
    }
    this.hooks.onStage(stage.id, this.view().hotspots)
    this.emit()
  }

  private listen(): void {
    const c = this.canvas
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Document, type: K | string, fn: (e: never) => void, options?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, options)
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, options))
    }
    on(c, 'pointerdown', (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.engaged = true
      this.touch()
    })
    on(c, 'pointermove', (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (this.pointers.size === 1) {
        this.tween = null
        this.pose.yaw -= dx * 0.0062
        this.pose.pitch = clamp(this.pose.pitch + dy * 0.0052, -1.35, 1.35)
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        const gap = Math.hypot(a!.x - b!.x, a!.y - b!.y)
        if (this.pinch > 0 && gap > 0) this.zoomBy(this.pinch / gap)
        this.pinch = gap
      }
      this.touch()
    })
    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
      this.pinch = 0
    }
    on(c, 'pointerup', release)
    on(c, 'pointercancel', release)
    on(
      c,
      'wheel',
      (e: WheelEvent) => {
        if (!this.engaged) return
        e.preventDefault()
        this.zoomBy(Math.exp(e.deltaY * 0.0014))
        this.touch()
      },
      { passive: false },
    )
    on(c, 'dblclick', () => this.resetView())
    on(document, 'pointerdown', (e: PointerEvent) => {
      const host = c.closest('.sim')
      if (host && e.target instanceof Node && !host.contains(e.target)) this.engaged = false
    })
    on(document, 'visibilitychange', () => this.schedule())
    on(c, 'webglcontextlost', (e: Event) => {
      e.preventDefault()
      this.lost = true
      cancelAnimationFrame(this.raf)
      this.raf = 0
    })
    on(c, 'webglcontextrestored', () => {
      this.lost = false
      this.seen.clear()
      this.boot()
    })

    const resize = new ResizeObserver(() => {
      this.sized = false
      this.wake()
    })
    resize.observe(c)
    const sight = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting)
      this.schedule()
    })
    sight.observe(c)
    this.cleanup.push(() => resize.disconnect(), () => sight.disconnect())
  }

  // ---------- comandos da tela ------------------------------------------------------------------

  /** Troca os dados (filtros mudaram); as cenas já montadas continuam valendo. */
  setStudy(study: SimStudy<S>): void {
    this.study = study
    this.stage = study.stages.find((s) => s.id === this.stage.id) ?? this.stage
  }

  setRun(run: SimRun<S> | null, autoplay = true): void {
    if (run && this.run && run.id === this.run.id) {
      this.run = run // mesmo ensaio, dados recalculados: mantém o relógio
      return this.wake()
    }
    this.run = run
    this.t = run?.start ?? 0
    this.ended = false
    this.playing = Boolean(run?.playable && autoplay && this.stage.experiment)
    this.emit()
  }

  go(stageId: string, instant = false): void {
    const next = this.study.stages.find((s) => s.id === stageId)
    if (!next || this.lost) return
    if (next.id === this.stage.id && !this.swap) return
    const now = performance.now() / 1000
    if (next.sceneKey === this.stage.sceneKey) {
      this.enter(next, now)
      this.flyTo(this.view().pose, this.still || instant ? 0 : 1.1)
      return
    }
    if (this.still || instant) {
      this.swap = null
      this.enter(next, now)
      this.pose = copy(this.view().pose)
      this.tween = null
      this.alpha = 1
      return this.wake()
    }
    const order = (id: string) => this.study.stages.findIndex((s) => s.id === id)
    const inward = order(next.id) > order(this.stage.id)
    const link = this.view().hotspots.find((h) => h.to === next.id)
    const from = copy(this.pose)
    const to: Pose = { target: inward && link ? link.at : from.target, yaw: from.yaw, pitch: from.pitch, dist: from.dist * (inward ? 0.24 : 2.4) }
    this.tween = { from, to, t0: now, dur: OUT_S }
    this.swap = { next: next.id, phase: 'out', t0: now, inward }
    this.wake()
  }

  private flyTo(to: Pose, dur: number): void {
    if (dur <= 0) {
      this.pose = copy(to)
      this.tween = null
    } else this.tween = { from: copy(this.pose), to, t0: performance.now() / 1000, dur }
    this.wake()
  }

  play(): void {
    if (!this.run?.playable) return
    if (this.ended) {
      this.t = this.run.start
      this.ended = false
    }
    this.playing = true
    this.emit()
  }
  pause(): void {
    this.playing = false
    this.emit()
  }
  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }
  seek(t: number): void {
    if (!this.run) return
    this.t = clamp(t, this.run.start, this.run.duration)
    this.ended = this.t >= this.run.duration
    if (this.ended) this.playing = false
    this.emit()
  }
  setSpeed(speed: number): void {
    this.speed = speed
  }
  zoomBy(factor: number): void {
    const [lo, hi] = this.view().zoom
    this.tween = null
    this.pose.dist = clamp(this.pose.dist * factor, lo, hi)
    this.wake()
  }
  resetView(): void {
    this.flyTo(this.view().pose, this.still ? 0 : 0.8)
    this.touch()
  }
  setAutoRotate(on: boolean): void {
    this.autoRotate = on
    this.wake()
  }
  setFocus(tag: string | null): void {
    this.focus = tag
    this.wake()
  }
  setEngaged(on: boolean): void {
    this.engaged = on
  }
  /** Pede um quadro (um rótulo novo entrou na tela, por exemplo). */
  refresh(): void {
    this.wake()
  }
  snapshot(): Tick {
    return { t: this.t, playing: this.playing, ended: this.ended }
  }

  private touch(): void {
    this.lastInput = this.now
    this.hooks.onInput()
    this.wake()
  }
  private emit(): void {
    this.lastTick = this.now
    this.hooks.onTick(this.snapshot())
    this.wake()
  }
  private wake(): void {
    this.schedule()
  }
  private schedule(): void {
    if (this.raf || this.lost || !this.visible || document.hidden) return
    this.last = 0
    this.raf = requestAnimationFrame(this.frame)
  }

  // ---------- laço ------------------------------------------------------------------------------

  private frame = (ms: number): void => {
    this.raf = 0
    if (this.lost || !this.visible || document.hidden) return
    const now = ms / 1000
    const dt = this.last ? Math.min(0.05, now - this.last) : 1 / 60
    this.last = now
    this.now = now
    this.tune(dt)

    const run = this.run
    const live = this.stage.experiment
    if (this.playing && live && run) {
      this.t += (dt * (run.duration - run.start) * this.speed) / run.wall
      if (this.t >= run.duration) {
        this.t = run.duration
        this.playing = false
        this.ended = true
        this.hooks.onTick(this.snapshot())
        this.hooks.onEnded()
      }
    }

    const moving = this.moveCamera(now, dt)
    const r = this.r
    if (!this.sized) {
      const box = this.canvas.getBoundingClientRect()
      r.resize(box.width, box.height, Math.min(window.devicePixelRatio || 1, MAX_DPR) * this.quality)
      this.sized = true
    }
    const view = this.view()
    // em tela estreita as fichas ficam no alto: a cena desce para o meio livre
    r.camera(this.pose, r.width < 700 ? NARROW_CENTER : (view.center ?? WIDE_CENTER), this.scene.radius, this.scene.near)
    r.begin(this.still && !this.playing ? 0 : now)

    const f = this.frameCtx
    f.run = run
    f.t = this.t
    f.live = live
    f.now = now
    f.dt = dt
    f.reveal = this.still ? 1 : clamp((now - this.born) / this.revealFor)
    f.alpha = this.alpha
    f.focus = this.focus
    this.scene.draw(f)
    this.place(view.hotspots)
    this.placeDims(this.scene.dims?.(f) ?? [])

    if (this.playing && now - this.lastTick > 0.08) {
      this.lastTick = now
      this.hooks.onTick(this.snapshot())
    }
    // com movimento reduzido só redesenha quando algo muda
    if (!this.still || this.playing || moving || f.reveal < 1) this.raf = requestAnimationFrame(this.frame)
  }

  /** Ajuste dinâmico da resolução interna pelo tempo de quadro. */
  private tune(dt: number): void {
    this.ema += (dt - this.ema) * 0.08
    if (this.ema > 0.024) {
      this.slowFor += dt
      this.fastFor = 0
      if (this.slowFor > 0.9 && this.quality > MIN_QUALITY) {
        this.quality = Math.max(MIN_QUALITY, this.quality * 0.85)
        this.slowFor = 0
        this.sized = false
      }
    } else if (this.ema < 0.0175) {
      this.fastFor += dt
      this.slowFor = 0
      if (this.fastFor > 5 && this.quality < 1) {
        this.quality = Math.min(1, this.quality / 0.9)
        this.fastFor = 0
        this.sized = false
      }
    }
  }

  private moveCamera(now: number, dt: number): boolean {
    let moving = this.pointers.size > 0
    const tw = this.tween
    if (tw) {
      const k = clamp((now - tw.t0) / tw.dur)
      const e = ease(k)
      const p = this.pose
      for (let i = 0; i < 3; i++) p.target[i] = lerp(tw.from.target[i]!, tw.to.target[i]!, e)
      // o giro vai pelo caminho mais curto
      let dy = (tw.to.yaw - tw.from.yaw) % (Math.PI * 2)
      if (dy > Math.PI) dy -= Math.PI * 2
      if (dy < -Math.PI) dy += Math.PI * 2
      p.yaw = tw.from.yaw + dy * e
      p.pitch = lerp(tw.from.pitch, tw.to.pitch, e)
      p.dist = Math.exp(lerp(Math.log(tw.from.dist), Math.log(tw.to.dist), e))
      if (k >= 1) this.tween = null
      moving = true
    }
    const sw = this.swap
    if (sw) {
      moving = true
      if (sw.phase === 'out') {
        this.alpha = 1 - ease(clamp((now - sw.t0) / OUT_S))
        if (now - sw.t0 >= OUT_S) {
          const next = this.study.stages.find((s) => s.id === sw.next) ?? this.stage
          this.enter(next, now)
          const to = this.view().pose
          this.pose = copy({ ...to, dist: to.dist * (sw.inward ? 2.6 : 0.4) })
          this.tween = { from: copy(this.pose), to, t0: now, dur: 1.15 }
          sw.phase = 'in'
          sw.t0 = now
        }
      } else {
        this.alpha = ease(clamp((now - sw.t0) / IN_S))
        if (now - sw.t0 >= IN_S) {
          this.alpha = 1
          this.swap = null
        }
      }
    }
    const idleFor = now - this.lastInput - 3.5
    if (this.autoRotate && !this.still && !moving && idleFor > 0) {
      // volta inteira nas cenas amplas; nas de bancada, um vaivém que não tira o plano de leitura de vista
      this.pose.yaw += this.view().idle === 'spin' ? dt * 0.05 : dt * 0.055 * Math.cos(idleFor * 0.16)
    }
    return moving
  }

  private place(hotspots: readonly Hotspot[]): void {
    const r = this.r
    for (const h of hotspots) {
      const el = this.overlay.hot.get(h.id)
      if (!el) continue
      const p = r.project(h.at, this.tmp)
      const inside = p.front && p.x > -40 && p.x < r.width + 40 && p.y > -40 && p.y < r.height + 40 && (h.shown?.() ?? true)
      el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`
      el.style.opacity = inside ? String(Math.round(this.alpha * 100) / 100) : '0'
      el.style.pointerEvents = inside && this.alpha > 0.6 ? '' : 'none'
    }
  }

  private placeDims(dims: readonly Dim[]): void {
    const r = this.r
    const els = this.overlay.dims
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      if (!el) continue
      const d = dims[i]
      if (!d) {
        el.style.opacity = '0'
        continue
      }
      const p = r.project(d.at, this.tmp)
      const w = Math.max(2, d.width * p.scale)
      const half = w / 2
      el.style.opacity = p.front ? String(Math.round(this.alpha * 100) / 100) : '0'
      el.style.width = `${w.toFixed(1)}px`
      el.style.transform = `translate3d(${(p.x - half).toFixed(1)}px,${(p.y + (d.above ? -1 : 1) * (d.offset ?? (d.clear === undefined ? half : d.clear * p.scale) + 12)).toFixed(1)}px,0)`
      if (this.dimText.get(el) !== d.text) {
        this.dimText.set(el, d.text)
        el.dataset.tone = d.tone
        el.dataset.above = d.above ? 'true' : 'false'
        const label = el.firstElementChild
        if (label) label.textContent = d.text
      }
    }
  }

  /** Posição de tela de um ponto da cena atual (para testes e depuração). */
  screenOf(p: V3): Projected {
    return this.r.project(p, { x: 0, y: 0, scale: 1, depth: 1, front: true })
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const off of this.cleanup) off()
    this.cleanup = []
    if (!this.lost) {
      for (const scene of this.scenes.values()) scene.dispose()
      this.r.dispose()
    }
    this.scenes.clear()
    this.lost = true
  }
}
