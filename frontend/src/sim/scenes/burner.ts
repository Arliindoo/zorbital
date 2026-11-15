/**
 * Cenas 2 e 3 do PSI-142: um queimador de contrafluxo numa bancada óptica, em solo.
 *
 * Dois bocais opostos sopram um contra o outro (combustível de baixo, oxidante de cima); a chama
 * é um disco plano onde os jatos se encontram. Unidade: milímetro. O escoamento dos traçadores é o
 * do contrafluxo ideal (r = r0·e^(aτ/2), y = y0·e^(−aτ)), com o ritmo regulado pelo estiramento
 * do ponto em reprodução. O que é dado: os pontos digitalizados de cada série. O que é esquema: o
 * queimador, a bancada e os instrumentos — a fonte não traz a geometria do aparato.
 */

import type { Lines, Renderer } from '../engine/renderer'
import { clamp, lerp, scaling, translate, type V3 } from '../engine/vec'
import { type Mesh, type Tone, Wire } from '../engine/wire'
import { compose } from '../engine/vec'
import type { Hotspot, Scene } from '../types'

export type Instrument = 'plif' | 'camera' | 'sonda'

export interface BurnerRun {
  kind: 'limite' | 'perfil'
  /** cor da zona de reação nesta série */
  tone: Tone
  /** perfil normalizado (0..1) ao longo do eixo, do bocal de baixo ao de cima — só em `perfil` */
  profile: Float32Array | null
  /** posição do máximo do perfil, 0..1 */
  peak: number
  instrument: Instrument | null
  /** 0..1 ao longo do relógio: onde está a leitura (perfil) ou o ponto da curva (limite) */
  progress: (t: number) => number
  /** estiramento relativo, 0..1: regula a pressa dos traçadores */
  strain: (t: number) => number
  /** vigor da chama, 0..1 */
  power: (t: number) => number
}

const L = 11.2 // meia distância entre os bocais
const RN = 6.5 // raio da saída do bocal
const TABLE = -86

function buildBench(): Mesh[] {
  const w = new Wire()
  const out: Mesh[] = []
  // bocais convergentes, com a coifa de gás inerte por fora
  for (const s of [-1, 1]) {
    w.tube([0, s * (L + 62), 0], [0, s * (L + 18), 0], 14, 14, { rings: 3, sides: 8, seg: 28 })
    w.tube([0, s * (L + 18), 0], [0, s * L, 0], 14, RN, { rings: 3, sides: 8, seg: 28 })
    w.ring([0, s * L, 0], [0, 1, 0], RN, 32)
    w.tube([0, s * (L + 24), 0], [0, s * (L + 2), 0], 19, 11.5, { rings: 2, sides: 8, seg: 28 })
  }
  out.push(w.mesh('ink', 0.78, { tag: 'queimador', width: 1.3 }))
  // suporte, linhas de gás e mesa óptica com a grade de furos
  w.box([-52, -6, -30], [8, 168, 8])
  for (const s of [-1, 1]) w.path([[-52, s * (L + 40), -30], [-14, s * (L + 40), 0]])
  w.path([[0, -(L + 62), 0], [0, TABLE, 0]])
  w.path([[0, L + 62, 0], [0, L + 78, 0], [-52, L + 78, -30]])
  out.push(w.mesh('dim', 0.45, { tag: 'suporte' }))
  w.quad([-190, TABLE, -170], [190, TABLE, -170], [190, TABLE, 190], [-190, TABLE, 190], { grid: [19, 18], fill: true })
  out.push(w.mesh('faint', 0.5, { tag: 'mesa', fill: 0.025 }))
  // laser de PLIF: fonte, lente e as bordas da folha de luz
  w.box([-150, 0, 0], [58, 24, 24])
  w.path([[-150, -12, 0], [-150, TABLE, 0]])
  w.seg([-121, 0, 0], [-74, 0, 0])
  w.ring([-74, 0, 0], [1, 0, 0], 9, 20)
  w.path([[-74, 0, 0], [-22, L - 1, 0]]).path([[-74, 0, 0], [-22, -L + 1, 0]])
  out.push(w.mesh('violet', 0.75, { tag: 'plif' }))
  // câmera intensificada, de frente para a zona de reação
  w.box([0, 0, 150], [46, 36, 60])
  w.tube([0, 0, 120], [0, 0, 92], 13, 13, { rings: 3, sides: 6, seg: 20 })
  w.ring([0, 0, 88], [0, 0, 1], 15, 22)
  w.path([[0, -18, 150], [0, TABLE, 150]])
  w.dashed([0, 0, 88], [0, 0, 16], 14)
  out.push(w.mesh('cyan', 0.75, { tag: 'camera' }))
  return out
}

/** Sonda de termometria: haste que entra pelo lado; a ponta fica na origem. */
function probe(w: Wire): Mesh {
  w.seg([0.6, 0, 0], [86, 0, 0])
  w.ring([0.6, 0, 0], [1, 0, 0], 0.6, 8)
  w.box([96, 0, 0], [20, 12, 12])
  w.path([[96, -6, 0], [96, -40, 0]])
  return w.mesh('amber', 0.85, { width: 1.2 })
}

/** A curva do perfil desenhada no próprio vão entre os bocais, ao lado do eixo. */
function ribbon(w: Wire, profile: Float32Array, tone: Tone): Mesh {
  const n = profile.length
  const pts: V3[] = []
  for (let i = 0; i < n; i++) pts.push([RN + 5 + profile[i]! * 26, lerp(-L, L, i / (n - 1)), 0])
  w.path(pts)
  w.seg([RN + 5, -L, 0], [RN + 5, L, 0])
  w.ticks([RN + 5, -L, 0], [RN + 5, L, 0], [-1.6, 0, 0], 10, 5)
  return w.mesh(tone, 1, { width: 1.5 })
}

const INSTRUMENT_TAG: Record<Instrument, string> = { plif: 'plif', camera: 'camera', sonda: 'sonda' }

export function burnerScene(r: Renderer, next: string): Scene<BurnerRun> {
  const w = new Wire()
  const meshes = buildBench()
  const bench: Lines = r.lines(meshes)
  const table = r.fills(meshes)
  const probeLines = r.lines([probe(w)])
  const scanRing = (() => {
    w.ring([0, 0, 0], [0, 1, 0], 1, 48)
    return r.lines([w.mesh('ink', 0.9, { width: 1.2 })])
  })()
  // por série: a curva no vão e a textura que pinta a faixa
  const cache = new Map<string, { lines: Lines; data: WebGLTexture }>()
  const forRun = (id: string, s: BurnerRun) => {
    let hit = cache.get(id)
    if (!hit && s.profile) {
      hit = { lines: r.lines([ribbon(w, s.profile, s.tone)]), data: r.dataTexture(s.profile) }
      cache.set(id, hit)
    }
    return hit
  }

  const far: Hotspot[] = [
    { id: 'queimador', at: [0, L + 40, 0], label: 'Queimador de contrafluxo', sub: 'dois bocais opostos · entrar na zona de reação', to: next, tag: 'queimador', dx: -50, dy: -70 },
    { id: 'plif', at: [-150, 12, 0], label: 'Laser de PLIF', sub: 'folha de luz que faz o formaldeído (CH2O) fluorescer', tag: 'plif', dx: -30, dy: -50, minor: true },
    { id: 'camera', at: [0, 18, 150], label: 'Câmera intensificada', sub: 'registra a quimiluminescência', tag: 'camera', dx: 40, dy: -44, minor: true },
    { id: 'mesa', at: [150, TABLE, 150], label: 'Mesa óptica', sub: 'bancada em solo, sob 1 g', tag: 'mesa', dx: 30, dy: 30, minor: true },
  ]
  const near: Hotspot[] = [
    { id: 'oxidante', at: [0, L + 6, 0], label: 'Oxidante', sub: 'entra por cima', dx: -44, dy: -40, minor: true },
    { id: 'combustivel', at: [0, -L - 6, 0], label: 'Combustível', sub: 'entra por baixo, diluído', dx: -44, dy: 40, minor: true },
  ]

  return {
    radius: 150,
    near: 2,
    views: {
      bancada: { pose: { target: [-10, -18, 30], yaw: 0.72, pitch: 0.3, dist: 560 }, zoom: [160, 1500], center: [0.44, 0.47], hotspots: far },
      zona: { pose: { target: [6, 0, 0], yaw: 0.3, pitch: 0.12, dist: 138 }, zoom: [34, 900], center: [0.49, 0.45], hotspots: near },
    },
    draw(f) {
      const a = f.alpha
      const run = f.run
      const s = run?.state
      const focus = f.focus ?? (s?.instrument ? INSTRUMENT_TAG[s.instrument] : null)
      r.stars(a * 0.14)
      r.drawFills(table, { reveal: f.reveal, alpha: a })
      r.drawLines(bench, { reveal: f.reveal, alpha: a, focus, focusAmount: f.focus ? 0.85 : 0.5 })
      if (!run || !s) return

      const t = f.live ? f.t : lerp(run.start, run.duration, 0.5)
      const u = clamp(s.progress(t))
      const strain = clamp(s.strain(t))
      const power = clamp(s.power(t))
      const flick = f.still ? 1 : 0.9 + 0.1 * Math.sin(f.now * 12.3) * Math.sin(f.now * 5.1)

      // escoamento: os dois jatos se encontram no plano de estagnação e saem pelos lados
      r.particles({ mode: 2, p0: [L, RN, 34, 3.3], p1: [0.1 + 0.36 * strain, 0, 0, 0], color: 'amber', color2: 'cyan', alpha: a * 0.6, size: 1.9, count: 900 })

      // zona de reação: no máximo do perfil, quando há perfil; senão, no plano de estagnação
      const yf = s.kind === 'perfil' ? lerp(-L, L, s.peak) : 0
      // no limite de extinção a chama oscila prestes a apagar
      const edge = s.kind === 'limite' && !f.still ? 0.72 + 0.28 * Math.abs(Math.sin(f.now * 3.1)) : 1
      r.sprite({ at: [0, yf, 0], radius: 15, kind: 3, color: s.tone, color2: 'ink', p: [0.25, 0.86, (0.6 + 0.9 * power) * edge, f.still ? 0 : 0.5], plane: [[15, 0, 0], [0, 0, 15]], alpha: a * flick, seed: 2 })
      r.sprite({ at: [0, yf, 0], radius: 26, kind: 0, color: s.tone, p: [2.2, 0.42 * (0.4 + 0.6 * power) * edge, 0, 0], alpha: a, axis: [0, 1, 0], stretch: 0.42 })

      if (s.kind === 'perfil') {
        const y = lerp(-L, L, u)
        const built = forRun(run.id, s)
        if (built) {
          // a curva medida, no lugar onde foi medida, e a faixa que ela pinta sobre o eixo
          r.sprite({ at: [0, 0, 0], radius: L, kind: 5, color: s.tone, color2: 'faint', p: [1.4, 0.75, u * 2 - 1, 0.03], plane: [[RN, 0, 0], [0, L, 0]], data: built.data, alpha: a })
          r.drawLines(built.lines, { alpha: a, reveal: f.reveal })
        }
        r.drawLines(scanRing, { model: compose(translate([0, y, 0]), scaling(RN * 1.25)), alpha: a * 0.9 })
        if (s.instrument === 'plif') r.sprite({ at: [-6, 0, 0], radius: L, kind: 4, color: 'violet', p: [0.2, u * 2 - 1, 0.7, 0], plane: [[26, 0, 0], [0, L, 0]], alpha: a })
        if (s.instrument === 'sonda') r.drawLines(probeLines, { model: translate([0, y, 0]), alpha: a, reveal: f.reveal })
      }
    },
    dispose() {
      for (const batch of [bench, table, probeLines, scanRing]) r.free(batch)
      for (const item of cache.values()) {
        r.free(item.lines)
        r.deleteTexture(item.data)
      }
      cache.clear()
    },
  }
}
