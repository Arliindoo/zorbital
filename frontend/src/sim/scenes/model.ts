/**
 * Cena do PSI-117: a gota no domínio do modelo numérico.
 *
 * Dois modos, conforme o item escolhido. Unidade: milímetro.
 *  - "gêmeas": a gota medida e a gota do modelo, lado a lado, encolhendo até o diâmetro de extinção
 *    de cada uma, com a faixa de incerteza desenhada como anéis. Os diâmetros finais são da fonte;
 *    o caminho até eles é ilustrativo (a tabela só traz o fim).
 *  - "série": a saída do modelo ao longo do tempo — diâmetro da gota, casca onde a temperatura é
 *    máxima e casca onde o OH é máximo. Tudo aqui é número da fonte (simulado, não medido).
 */

import type { Lines, Renderer } from '../engine/renderer'
import { clamp, compose, lerp, rotX, rotY, scaling, translate, type V3 } from '../engine/vec'
import { type Mesh, type Tone, Wire } from '../engine/wire'
import { fixed } from '@/lib/format'
import { d2 } from '../replay/droplet'
import type { Dim, Hotspot, Scene } from '../types'

export interface TwinState {
  kind: 'twin'
  flame: 'hot' | 'cool'
  d0: number
  measured: number
  model: number
  /** faixa de incerteza informada para a medição (só existe para a chama fria) */
  band: readonly [number, number] | null
}

export interface SeriesState {
  kind: 'series'
  /** amostras da simulação, em ordem de tempo */
  t: Float32Array
  d: Float32Array
  tmax: Float32Array
  /** diâmetro onde T é máxima e onde OH é máximo (já em mm) */
  dT: Float32Array
  dOH: Float32Array
}

export type ModelRun = TwinState | SeriesState

const GAP = 5.6 // meia distância entre as gêmeas

/** Posição de `t` numa série crescente, como índice fracionário. */
export function locate(times: Float32Array, t: number): number {
  const last = times.length - 1
  if (t <= times[0]!) return 0
  if (t >= times[last]!) return last
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid]! <= t) lo = mid
    else hi = mid
  }
  return lo + (t - times[lo]!) / (times[hi]! - times[lo]! || 1)
}
export const sample = (values: Float32Array, at: number): number => {
  const i = Math.floor(at)
  const j = Math.min(values.length - 1, i + 1)
  return lerp(values[i]!, values[j]!, at - i)
}

function buildDomain(): Mesh[] {
  const w = new Wire()
  const out: Mesh[] = []
  // piso em grade: o "laboratório" aqui é um domínio de cálculo
  w.quad([-26, -9, -18], [26, -9, -18], [26, -9, 18], [-26, -9, 18], { grid: [26, 18] })
  out.push(w.mesh('faint', 0.34, { tag: 'dominio' }))
  // eixos
  w.dashed([-24, 0, 0], [24, 0, 0], 60).dashed([0, -9, 0], [0, 9, 0], 24)
  w.ticks([-24, -9, 18], [24, -9, 18], [0, 0.7, 0], 48, 5)
  out.push(w.mesh('faint', 0.6, { tag: 'dominio' }))
  return out
}

function unitRing(w: Wire, tone: Tone, dash: boolean, alpha = 0.9): Mesh {
  w.ring([0, 0, 0], [0, 0, 1], 1, 72, { dash })
  return w.mesh(tone, alpha, { width: 1.25 })
}
function unitShell(w: Wire, tone: Tone): Mesh {
  w.sphere([0, 0, 0], 1, 4, 6, 40)
  return w.mesh(tone, 0.5, { width: 1 })
}

export function modelScene(r: Renderer): Scene<ModelRun> {
  const w = new Wire()
  const domain: Lines = r.lines(buildDomain())
  const rings = {
    start: r.lines([unitRing(w, 'dim', true, 0.7)]),
    measured: r.lines([unitRing(w, 'ink', false)]),
    model: r.lines([unitRing(w, 'magenta', true)]),
    band: r.lines([unitRing(w, 'signal', true, 0.75)]),
    oh: r.lines([unitRing(w, 'violet', true, 0.8)]),
  }
  const shells = { hot: r.lines([unitShell(w, 'hot')]), cool: r.lines([unitShell(w, 'cool')]), drop: r.lines([unitShell(w, 'ink')]) }

  const hotspots: Hotspot[] = [{ id: 'dominio', at: [-24, -9, 18], label: 'Domínio do modelo', sub: 'régua de 1 mm no piso', tag: 'dominio', dx: 30, dy: 36, minor: true }]
  const dims: Dim[] = []
  const left: V3 = [-GAP, 0, 0]
  const right: V3 = [GAP, 0, 0]
  const origin: V3 = [0, 0, 0]

  const droplet = (at: V3, radius: number, tone: Tone | null, a: number, now: number) => {
    if (radius < 0.004) return
    r.sprite({ at, radius, kind: 2, color: 'ink', color2: tone ?? 'ink', p: [tone ? 0.75 : 0, 0, 0, 0], alpha: a, blend: 'over' })
    r.drawLines(shells.drop, { model: compose(translate(at), rotY(now * 0.4), scaling(radius)), alpha: a * 0.4 })
  }
  const flame = (at: V3, radius: number, kind: 'hot' | 'cool', power: number, a: number, now: number, still: boolean, seed: number) => {
    if (power < 0.01 || radius < 0.01) return
    const tone: Tone = kind === 'hot' ? 'hot' : 'cool'
    r.sprite({ at, radius: radius * 2.5, kind: 0, color: tone, p: [2.6, 0.13 * power, 0, 0], alpha: a })
    r.sprite({ at, radius: radius / 0.69, kind: 1, color: tone, color2: kind === 'hot' ? 'red' : 'violet', p: [0.69, 0.06, still ? 0 : 0.06, 0.03], alpha: a * power, seed })
    r.drawLines(shells[kind], { model: compose(translate(at), rotY(now * 0.17), rotX(0.3), scaling(radius)), alpha: a * 0.2 * power })
  }

  return {
    radius: 34,
    near: 0.2,
    views: {
      main: { pose: { target: [0, -0.6, 0], yaw: 0.26, pitch: 0.16, dist: 34 }, zoom: [3, 220], center: [0.49, 0.45], hotspots },
    },
    draw(f) {
      const a = f.alpha
      dims.length = 0
      r.stars(a * 0.14)
      r.drawLines(domain, { reveal: f.reveal, alpha: a, focus: f.focus, focusAmount: 0.8 })
      const run = f.run
      const s = run?.state
      if (!run || !s) return
      const now = f.still ? 0 : f.now

      if (s.kind === 'twin') {
        const u = f.live ? clamp(f.t / run.duration) : 1
        const burn = clamp(u / 0.82) // encolhe até 82% do relógio; o resto é a leitura final
        const done = burn >= 1
        const pairs: readonly [V3, number][] = [[left, s.measured], [right, s.model]]
        for (const [at, dEnd] of pairs) {
          const d = d2(s.d0, dEnd, burn)
          r.drawLines(rings.start, { model: r.billboard(at, s.d0 / 2), alpha: a * 0.5 })
          flame(at, (d / 2) * (s.flame === 'hot' ? 2.6 : 1.9) + 0.15, s.flame, done ? 0 : 1, a, now, f.still, at[0] < 0 ? 1 : 5)
          droplet(at, d / 2, done ? null : s.flame, a, now)
          // a medição como referência nas duas gotas; o modelo, em magenta, na dele
          if (s.measured > 0.01) r.drawLines(rings.measured, { model: r.billboard(at, s.measured / 2), alpha: a * (at[0] < 0 ? 0.9 : 0.45) })
          if (s.band) for (const edge of s.band) if (edge > 0.01) r.drawLines(rings.band, { model: r.billboard(at, edge / 2), alpha: a * 0.7 })
        }
        if (s.model > 0.01) r.drawLines(rings.model, { model: r.billboard(right, s.model / 2), alpha: a })
        dims.push({ at: left, width: Math.max(s.measured, 0.02), text: `medido ⌀ ${fixed(s.measured, 2)} mm`, tone: 'ink', clear: s.d0 / 2 })
        dims.push({ at: right, width: Math.max(s.model, 0.02), text: `modelo ⌀ ${fixed(s.model, 2)} mm`, tone: 'magenta', clear: s.d0 / 2 })
        return
      }

      // ---- série temporal do modelo
      const i = locate(s.t, f.live ? f.t : s.t[Math.floor(s.t.length * 0.4)]!)
      const d = sample(s.d, i)
      const temp = sample(s.tmax, i)
      const dT = sample(s.dT, i)
      const dOH = sample(s.dOH, i)
      // a casca de T máxima é a chama: fria (azul) abaixo de ~850 K, quente (laranja) acima
      const kind: 'hot' | 'cool' = temp > 880 ? 'hot' : 'cool'
      const power = clamp((temp - 560) / 260, 0.15, 1.2)
      flame(origin, dT / 2, kind, power, a, now, f.still, 3)
      r.drawLines(rings.oh, { model: r.billboard(origin, dOH / 2), alpha: a * 0.8 })
      r.drawLines(rings.start, { model: r.billboard(origin, s.d[0]! / 2), alpha: a * 0.5 })
      droplet(origin, d / 2, kind, a, now)
      r.particles({ mode: 0, p0: [d / 2, dT / 2, 0, 0], p1: [0.5, 0, 0, 0], color: 'dim', alpha: a * 0.45, size: 1.6, count: 220 })
      if (f.live) {
        dims.push({ at: origin, width: dT, text: `T máx em ⌀ ${fixed(dT, 2)} mm`, tone: kind === 'hot' ? 'hot' : 'cool' })
        dims.push({ at: origin, width: Math.max(d, 0.02), text: `gota ⌀ ${fixed(d, 3)} mm`, tone: 'ink', above: true, clear: dT / 2 })
      }
    },
    dims: () => dims,
    dispose() {
      for (const batch of [domain, ...Object.values(rings), ...Object.values(shells)]) r.free(batch)
    },
  }
}
