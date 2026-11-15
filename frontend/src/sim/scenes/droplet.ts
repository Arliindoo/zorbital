/**
 * Cena 3 dos estudos de gota (FLEX, CFI): o interior da câmara de combustão.
 *
 * Unidade: milímetro, origem no centro da gota. O que é dado: diâmetro da gota a cada instante
 * (reconstruído pela lei do d² entre os valores medidos), anéis de D0 e do diâmetro de extinção,
 * tipo de chama em cada trecho e presença da fibra de suporte. O que é ilustração: a posição e o
 * brilho da chama, a deriva da gota, o vapor e a coreografia de agulhas e ignitores.
 */

import type { Lines, Renderer } from '../engine/renderer'
import { clamp, compose, ease, lerp, type Mat, ramp, rotY, rotZ, scaling, translate, type V3 } from '../engine/vec'
import { type Mesh, type Tone, Wire } from '../engine/wire'
import { fixed } from '@/lib/format'
import { type DropletPlan, stateAt } from '../replay/droplet'
import type { Dim, Hotspot, Scene } from '../types'

export type Ending = 'extincao' | 'completa' | 'ruptura' | 'consumida' | 'aberto'

export interface DropletRun {
  plan: DropletPlan
  /** gota presa a uma fibra (senão, livre) */
  fiber: boolean | null
  ending: Ending
  /** brilho relativo da chama quente, 0..1 (da radiometria, quando a fonte traz) */
  glow: number
}

const NEEDLE_REST = 27
const FRAME = 18 // meia-medida do retículo

/** Razão entre o raio da chama e o da gota. Ilustrativa: a fonte não traz o diâmetro da chama. */
const standoff = (kind: 'hot' | 'cool', u: number): number => (kind === 'hot' ? lerp(2.5, 3.3, u) : lerp(1.75, 2.15, u))
const FLAME: Record<'hot' | 'cool', { tone: Tone; inner: Tone; core: number; gain: number }> = {
  hot: { tone: 'hot', inner: 'red', core: 0.05, gain: 1 },
  cool: { tone: 'cool', inner: 'violet', core: 0.015, gain: 0.7 },
}

function buildStatic(): Mesh[] {
  const w = new Wire()
  const out: Mesh[] = []
  // retículo milimetrado no plano da gota: é a régua da cena
  const f = FRAME
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    w.path([[sx * f, sy * (f - 5), 0], [sx * f, sy * f, 0], [sx * (f - 5), sy * f, 0]])
  }
  w.ticks([-f, -f, 0], [f, -f, 0], [0, 1.1, 0], f * 2, 5)
  w.ticks([-f, -f, 0], [-f, f, 0], [1.1, 0, 0], f * 2, 5)
  w.ticks([f, f, 0], [-f, f, 0], [0, -1.1, 0], f * 2, 5)
  w.ticks([f, f, 0], [f, -f, 0], [-1.1, 0, 0], f * 2, 5)
  out.push(w.mesh('dim', 0.8, { tag: 'reticulo', width: 1 }))
  // eixos e anéis de distância (5, 10 e 15 mm do centro), bem tênues
  w.dashed([-f, 0, 0], [f, 0, 0], 72).dashed([0, -f, 0], [0, f, 0], 72)
  for (const radius of [5, 10, 15]) w.ring([0, 0, 0], [0, 0, 1], radius, 96, { dash: true })
  out.push(w.mesh('faint', 0.55, { tag: 'reticulo', width: 1 }))

  // estrutura do aparato de gotas e a parede da câmara, bem mais longe
  w.box([0, 0, 0], [150, 104, 104])
  for (const sx of [-75, 75]) w.path([[sx, -52, -52], [sx, 52, 52]]).path([[sx, 52, -52], [sx, -52, 52]])
  out.push(w.mesh('faint', 0.5, { tag: 'aparato' }))
  w.tube([0, 0, -300], [0, 0, 300], 195, 195, { rings: 5, sides: 12, seg: 56 })
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    const c: V3 = [195 * Math.cos(a), 195 * Math.sin(a), 0]
    w.ring(c, [Math.cos(a), Math.sin(a), 0], 38, 22)
    w.ring(c, [Math.cos(a), Math.sin(a), 0], 30, 22)
  }
  out.push(w.mesh('dim', 0.3, { tag: 'camara' }))
  return out
}

/** Agulha com a ponta na origem, apontando para −X (o corpo vai para +X). */
function needle(w: Wire): Mesh {
  w.tube([0, 0, 0], [3, 0, 0], 0.12, 0.34, { rings: 2, sides: 4, seg: 8 })
  w.tube([3, 0, 0], [64, 0, 0], 0.34, 0.34, { rings: 2, sides: 4, seg: 8 })
  w.box([72, 0, 0], [16, 7, 7])
  w.seg([80, 0, 0], [140, 0, 0])
  return w.mesh('ink', 0.75, { width: 1.2 })
}

/** Ignitor: haste diagonal com uma espira de fio quente na ponta (a ponta fica na origem). */
function igniter(w: Wire): Mesh {
  const d: V3 = [0.62, -0.78, 0]
  for (let k = 0; k < 4; k++) w.ring([d[0] * (0.5 + k * 0.55), d[1] * (0.5 + k * 0.55), 0], d, 0.85, 12)
  w.path([[d[0] * 2.4, d[1] * 2.4, 0], [d[0] * 46, d[1] * 46, 0]])
  w.box([d[0] * 52, d[1] * 52, 0], [9, 9, 6])
  return w.mesh('amber', 0.8, { width: 1.2 })
}

function unitSphere(w: Wire, tone: Tone, lat: number, lon: number, seg: number, alpha: number): Mesh {
  w.sphere([0, 0, 0], 1, lat, lon, seg)
  return w.mesh(tone, alpha, { width: 1 })
}

function unitRing(w: Wire, tone: Tone, dash: boolean): Mesh {
  w.ring([0, 0, 0], [0, 0, 1], 1, 72, { dash })
  return w.mesh(tone, 0.9, { width: 1.2 })
}

export function dropletScene(r: Renderer): Scene<DropletRun> {
  const w = new Wire()
  const fixedLines: Lines = r.lines(buildStatic())
  const needleLines = r.lines([needle(w)])
  const igniterLines = r.lines([igniter(w)])
  const fiberMesh = (() => {
    w.seg([0, -70, 0], [0, 70, 0])
    for (const sy of [-70, 70]) w.box([0, sy, 0], [10, 3, 10])
    return w.mesh('dim', 0.7, { width: 1 })
  })()
  const fiberLines = r.lines([fiberMesh])
  const dropWire = r.lines([unitSphere(w, 'ink', 3, 4, 28, 0.5)])
  const flameWire = { hot: r.lines([unitSphere(w, 'hot', 4, 6, 40, 0.5)]), cool: r.lines([unitSphere(w, 'cool', 4, 6, 40, 0.5)]) }
  const ringStart = r.lines([unitRing(w, 'dim', true)])
  const ringEnd = { hot: r.lines([unitRing(w, 'hot', true)]), cool: r.lines([unitRing(w, 'cool', true)]) }

  const hotspots: Hotspot[] = [
    { id: 'reticulo', at: [-FRAME, -FRAME, 0], label: 'Retículo', sub: '1 mm por marca · anéis a 5, 10 e 15 mm', tag: 'reticulo', dx: 24, dy: 36, minor: true },
    { id: 'agulha', at: [NEEDLE_REST + 4, 0, 0], label: 'Agulhas', sub: 'formam a gota e recuam', dx: 22, dy: -48, minor: true },
    { id: 'camara', at: [-138, 138, 0], label: 'Câmara de combustão', sub: 'parede e janelas de observação', tag: 'camara', dx: 30, dy: 30, minor: true },
  ]

  // a ruptura e o fim são animados pelo tempo de parede, depois que o relógio do ensaio para
  let endedRun = ''
  let endedAt = 0
  const dims: Dim[] = []
  const center: [number, number, number] = [0, 0, 0]

  return {
    radius: 70,
    near: 0.5,
    views: {
      main: { pose: { target: [0, 0, 0], yaw: 0.4, pitch: 0.12, dist: 50 }, zoom: [9, 1100], center: [0.49, 0.45], hotspots },
    },
    draw(f) {
      const a = f.alpha
      r.stars(a * 0.16)
      r.drawLines(fixedLines, { reveal: f.reveal, alpha: a, focus: f.focus, focusAmount: 0.8 })
      dims.length = 0
      const run = f.run
      const s = run?.state
      if (!run || !s || !run.playable) return

      const { plan } = s
      const start = run.start
      const t = f.live ? f.t : run.duration * 0.35 // fora da cena viva, um quadro parado no meio
      const pre = start < 0 ? clamp((t - start) / -start) : 1
      const st = stateAt(plan, t)
      const done = t >= run.duration
      if (done && endedRun !== run.id) {
        endedRun = run.id
        endedAt = f.now
      } else if (!done) endedRun = ''
      const after = done ? f.now - endedAt : 0

      // gota livre deriva um pouco; presa à fibra, não
      const r0 = plan.d0 / 2
      const free = s.fiber === false && !f.still ? 1 : 0
      center[0] = Math.sin(f.now * 0.31) * r0 * 0.16 * free
      center[1] = Math.sin(f.now * 0.23 + 1.3) * r0 * 0.12 * free
      center[2] = Math.cos(f.now * 0.19) * r0 * 0.1 * free
      const here = translate(center)

      // implantação: a gota cresce entre as agulhas, que depois recuam
      const grown = ramp(0, 0.34, pre)
      const radius = (st.d / 2) * (t < 0 ? grown : 1)
      const tip = lerp(Math.max(radius * 0.92, 0.3), NEEDLE_REST, ease(ramp(0.38, 0.62, pre)))
      r.drawLines(needleLines, { model: translate([tip, 0, 0]), alpha: a, reveal: f.reveal })
      r.drawLines(needleLines, { model: compose(scaling(-1, 1, 1), translate([tip, 0, 0])), alpha: a, reveal: f.reveal })
      if (s.fiber) r.drawLines(fiberLines, { alpha: a * 0.8, reveal: f.reveal })

      // ignitores: entram, aquecem, e recuam logo depois de acender
      const lit = ramp(0.55, 0.98, pre)
      const away = t > 0 ? ease(clamp(t / Math.max(-start * 0.6, plan.duration * 0.02))) : 0
      const reach = lerp(lerp(30, r0 * 1.6 + 1.4, ease(ramp(0.4, 0.7, pre))), 30, away)
      for (const side of [1, -1]) {
        const m: Mat = compose(scaling(side, 1, 1), translate([reach * 0.62, -reach * 0.78, 0]))
        r.drawLines(igniterLines, { model: m, alpha: a * (0.45 + 0.55 * lit * (1 - away)), reveal: f.reveal })
        if (lit > 0 && away < 1) r.sprite({ at: [reach * 0.62 + 0.8, -reach * 0.78 - 1, 0], model: scaling(side, 1, 1), radius: 3.2, kind: 0, color: 'amber', p: [2, lit * (1 - away) * 0.9, 0, 0], alpha: a })
      }

      // anel tracejado de D0: de onde a gota partiu
      r.drawLines(ringStart, { model: r.billboard(center, r0), alpha: a * 0.55 * grown })

      // chama: casca emissiva + malha tênue; a troca quente → fria é um colapso rápido
      const stage = st.stage
      if (stage && radius > 0.01) {
        const look = FLAME[stage.kind]
        const enter = ramp(0, stage.kind === 'hot' ? 0.03 : 0.05, st.u)
        const leave = stage.open ? 1 - ramp(0.55, 1, st.u) : 1 - ramp(0.985, 1, st.u)
        const power = enter * leave * (stage.kind === 'hot' ? 0.55 + 0.45 * s.glow : 1)
        const rf = radius * standoff(stage.kind, st.u) * (stage.kind === 'cool' ? lerp(1.5, 1, enter) : lerp(0.4, 1, enter))
        const flick = f.still ? 1 : 0.94 + 0.06 * Math.sin(f.now * 13) * Math.sin(f.now * 7.3)
        r.sprite({ at: center, radius: rf * 2.6, kind: 0, color: look.tone, p: [2.6, 0.13 * power * look.gain, 0, 0], alpha: a })
        r.sprite({ at: center, radius: rf / 0.69, kind: 1, color: look.tone, color2: look.inner, p: [0.69, stage.kind === 'hot' ? 0.05 : 0.075, f.still ? 0 : 0.06, look.core], alpha: a * power * look.gain * flick, seed: stage.kind === 'hot' ? 1 : 7 })
        r.drawLines(flameWire[stage.kind], { model: compose(here, rotY(f.now * 0.17), rotZ(0.35), scaling(rf)), alpha: a * 0.2 * power })
        r.particles({ mode: 0, p0: [radius, rf * 0.96, 0, 0], p1: [0.42, 0, 0, 0], color: 'dim', alpha: a * 0.5 * power, size: 1.7, count: 260, model: here })
        // alvo: o diâmetro em que este trecho termina (tracejado = medido; some se o fim não é conhecido)
        if (!stage.open && stage.dEnd > 0.02) r.drawLines(ringEnd[stage.kind], { model: r.billboard(center, stage.dEnd / 2), alpha: a * (stage.estimated ? 0.4 : 0.85) })
      }

      // a gota
      const rupture = s.ending === 'ruptura' && done
      if (radius > 0.01 && !rupture) {
        r.sprite({ at: center, radius, kind: 2, color: 'ink', color2: stage ? FLAME[stage.kind].tone : 'ink', p: [stage ? 0.75 : 0, 0, 0, 0], alpha: a, blend: 'over' })
        r.drawLines(dropWire, { model: compose(here, rotY(f.now * 0.4), scaling(radius)), alpha: a * 0.4 })
      }
      if (rupture) {
        // "ruptura" é como o ensaio da gota terminou, não uma explosão: a gota se desfaz em gotículas
        const k = f.still ? 1 : ease(clamp(after / 1.6))
        for (let i = 0; i < 7; i++) {
          const ang = i * 2.399 + 0.4
          const reachOut = radius * (0.25 + 2.6 * k) * (0.7 + 0.3 * Math.sin(i * 1.7))
          const at: V3 = [center[0] + Math.cos(ang) * reachOut, center[1] + Math.sin(ang) * reachOut * 0.8, center[2] + Math.sin(i * 2.1) * reachOut * 0.5]
          r.sprite({ at, radius: radius * (0.42 - 0.03 * i) * (1 - 0.25 * k), kind: 2, color: 'ink', p: [0, 0, 0, 0], alpha: a, blend: 'over' })
        }
      }

      if (f.live && radius > 0.05 && !rupture) dims.push({ at: center, width: radius * 2, text: `⌀ ${fixed(radius * 2, 2)} mm`, tone: 'ink' })
    },
    dims: () => dims,
    dispose() {
      for (const batch of [fixedLines, needleLines, igniterLines, fiberLines, dropWire, flameWire.hot, flameWire.cool, ringStart, ringEnd.hot, ringEnd.cool]) r.free(batch)
    },
  }
}
