/**
 * Cena 3 do BASS-II: o duto de escoamento dentro da MSG, com a amostra sólida em chamas.
 *
 * Unidade: milímetro; o gás sobe ao longo de +Y. O que é dado: a geometria e as dimensões da
 * amostra, o material, e as leituras de gás no começo e no fim do teste. O que é ilustração: a
 * chama, a velocidade do escoamento (a fonte só traz a leitura do painel, não calibrada) e o
 * avanço da queima sobre a amostra. O duto tem ≈ 7,6 × 7,6 × 17 cm.
 */

import { t } from '@/shared/lib/i18n'
import type { Lines, Renderer } from '@/visualization/engine/renderer'
import { clamp, compose, lerp, type Mat, rotY, scaling, translate, type V3 } from '@/visualization/engine/vec'
import { type Mesh, Wire } from '@/visualization/engine/wire'
import type { Dim, Hotspot, Scene } from '@/visualization/types'

export type SampleShape = 'Haste' | 'Filme' | 'Placa' | 'Seção esférica' | 'Vela' | 'Tecido'

export interface DuctRun {
  shape: SampleShape
  /** medidas da amostra em mm; nulo quando a fonte não traz (a cena usa um tamanho típico) */
  width: number | null
  thickness: number | null
  diameter: number | null
  /** O2 no começo e no fim, em % vol */
  o2: readonly [number, number | null]
  /** texto da cota, como está na fonte */
  size: string
}

const HX = 38
const HY = 85

function buildDuct(): Mesh[] {
  const w = new Wire()
  const out: Mesh[] = []
  // seção de teste
  w.box([0, 0, 0], [HX * 2, HY * 2, HX * 2])
  w.path([[-HX + 6, -HY + 10, HX], [HX - 6, -HY + 10, HX], [HX - 6, HY - 10, HX], [-HX + 6, HY - 10, HX]], true) // janela
  w.ticks([-HX, -HY, HX], [-HX, HY, HX], [-3, 0, 0], 17, 5)
  out.push(w.mesh('ink', 0.62, { tag: 'duto', width: 1.25 }))
  // entrada: ventilador e retificador de escoamento
  w.tube([0, -HY - 44, 0], [0, -HY - 12, 0], 31, 31, { rings: 3, sides: 8, seg: 28 })
  w.tube([0, -HY - 12, 0], [0, -HY, 0], 31, 44, { rings: 2, sides: 8, seg: 28 })
  w.quad([-HX, -HY, -HX], [HX, -HY, -HX], [HX, -HY, HX], [-HX, -HY, HX], { grid: [8, 8], fill: true })
  out.push(w.mesh('dim', 0.5, { tag: 'ventilador', fill: 0.03 }))
  // saída: tela e exaustão
  w.quad([-HX, HY, -HX], [HX, HY, -HX], [HX, HY, HX], [-HX, HY, HX], { grid: [10, 10] })
  w.tube([0, HY, 0], [0, HY + 36, 0], 44, 27, { rings: 3, sides: 8, seg: 28 })
  out.push(w.mesh('dim', 0.45, { tag: 'saida' }))
  // suporte da amostra, radiômetro e bocal de extinção
  w.path([[HX, -6, 0], [16, -6, 0], [16, -28, 0]])
  w.path([[HX, 6, 0], [16, 6, 0]])
  w.tube([-HX, 22, 0], [-HX + 16, 18, 0], 4.5, 4.5, { rings: 2, sides: 4, seg: 12, caps: true })
  w.tube([-HX, -52, 14], [-HX + 20, -46, 9], 2.2, 1.4, { rings: 2, sides: 4, seg: 10 })
  out.push(w.mesh('faint', 0.8, { tag: 'suporte' }))
  return out
}

function fan(w: Wire): Mesh {
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3
    w.path([[4 * Math.cos(a), 0, 4 * Math.sin(a)], [28 * Math.cos(a + 0.5), 3, 28 * Math.sin(a + 0.5)], [28 * Math.cos(a + 0.2), -3, 28 * Math.sin(a + 0.2)]], true)
  }
  w.ring([0, 0, 0], [0, 1, 0], 4, 12)
  return w.mesh('ink', 0.7)
}

/** Amostras em tamanho unitário (1 de raio/largura/comprimento); a matriz do quadro dá as medidas. */
function samples(w: Wire): Record<'rod' | 'sheet' | 'slab' | 'cap' | 'weave', Mesh> {
  w.tube([0, 0, 0], [0, 1, 0], 1, 1, { rings: 6, sides: 8, seg: 20, caps: true })
  const rod = w.mesh('ink', 0.95, { width: 1.3 })
  w.quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], { grid: [1, 10], fill: true })
  const sheet = w.mesh('ink', 0.95, { width: 1.3, fill: 0.08 })
  w.box([0, 0.5, 0], [1, 1, 1])
  w.quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], { grid: [1, 8], fill: true, frame: false })
  const slab = w.mesh('ink', 0.95, { width: 1.3, fill: 0.07 })
  for (let i = 0; i <= 4; i++) {
    const phi = (Math.PI / 2) * (i / 4)
    w.ring([0, Math.sin(phi) * -1, 0], [0, 1, 0], Math.max(0.02, Math.cos(phi)), 28)
  }
  for (let j = 0; j < 6; j++) {
    const a = (Math.PI * j) / 6
    w.ring([0, 0, 0], [Math.cos(a), 0, Math.sin(a)], 1, 28, { from: Math.PI, to: Math.PI * 2 })
  }
  const cap = w.mesh('ink', 0.95, { width: 1.3 })
  w.quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], { grid: [6, 30], fill: true })
  const weave = w.mesh('ink', 0.8, { width: 1, fill: 0.06 })
  return { rod, sheet, slab, cap, weave }
}

export function ductScene(r: Renderer): Scene<DuctRun> {
  const w = new Wire()
  const duct: Lines = r.lines(buildDuct())
  const blades = r.lines([fan(w)])
  const built = samples(w)
  const shapes = { rod: r.lines([built.rod]), sheet: r.lines([built.sheet]), slab: r.lines([built.slab]), cap: r.lines([built.cap]), weave: r.lines([built.weave]) }
  const fills = { sheet: r.fills([built.sheet]), slab: r.fills([built.slab]), weave: r.fills([built.weave]) }

  const hotspots: Hotspot[] = [
    { id: 'duto', at: [-HX, HY - 20, HX], label: t('Flow duct', 'Duto de escoamento'), sub: t('≈ 7.6 × 7.6 × 17 cm · 1 cm ruler', '≈ 7,6 × 7,6 × 17 cm · régua de 1 cm'), tag: 'duto', dx: -40, dy: -40, minor: true },
    { id: 'ventilador', at: [0, -HY - 28, 31], label: t('Fan', 'Ventilador'), sub: t('gas enters from below; the source gives the panel reading', 'o gás entra por baixo; a fonte dá a leitura do painel'), tag: 'ventilador', dx: -50, dy: 34, minor: true },
    { id: 'saida', at: [0, HY + 30, 27], label: t('Outlet', 'Saída'), sub: t('screen and exhaust', 'tela e exaustão'), tag: 'saida', dx: 40, dy: -30, minor: true },
  ]
  const dims: Dim[] = []

  return {
    radius: 190,
    near: 4,
    views: {
      main: { pose: { target: [0, -4, 0], yaw: 0.62, pitch: 0.16, dist: 470 }, zoom: [110, 1500], center: [0.49, 0.45], hotspots },
    },
    draw(f) {
      const a = f.alpha
      dims.length = 0
      r.stars(a * 0.14)
      r.drawLines(duct, { reveal: f.reveal, alpha: a, focus: f.focus, focusAmount: 0.8 })
      r.drawLines(blades, { model: compose(translate([0, -HY - 28, 0]), rotY(f.still ? 0 : f.now * 5)), alpha: a, reveal: f.reveal })
      const run = f.run
      const s = run?.state
      if (!run || !s) return
      const u = f.live ? clamp(f.t / run.duration) : 0.4

      // ---- amostra: forma e medidas da fonte
      const wide = s.width ?? 20
      const thick = s.thickness ?? (s.shape === 'Placa' ? 3 : 0.3)
      const dia = s.diameter ?? (s.shape === 'Vela' ? 10 : 9.5)
      let body = 5
      let length = 96
      let base = -48
      let model: Mat
      let cross = wide
      if (s.shape === 'Haste' || s.shape === 'Vela') {
        length = s.shape === 'Vela' ? 34 : 86
        base = s.shape === 'Vela' ? -8 : -43
        body = dia / 2
        cross = dia
        model = compose(translate([0, base, 0]), scaling(dia / 2, length, dia / 2))
        r.drawLines(shapes.rod, { model, alpha: a, reveal: f.reveal })
        if (s.shape === 'Vela') r.drawLines(shapes.rod, { model: compose(translate([0, base - 7, 0]), scaling(0.5, 7, 0.5)), alpha: a * 0.8 })
      } else if (s.shape === 'Seção esférica') {
        body = dia / 2
        cross = dia
        length = dia / 2
        base = -dia / 4
        r.drawLines(shapes.cap, { model: compose(translate([0, base + dia / 2, 0]), scaling(dia / 2)), alpha: a, reveal: f.reveal })
      } else if (s.shape === 'Placa') {
        length = 70
        base = -35
        body = Math.max(wide, thick) / 2
        model = compose(translate([0, base, 0]), scaling(wide, length, thick))
        r.drawFills(fills.slab, { model, alpha: a })
        r.drawLines(shapes.slab, { model, alpha: a, reveal: f.reveal })
      } else {
        const kind = s.shape === 'Tecido' ? 'weave' : 'sheet'
        body = wide / 2
        model = compose(translate([0, base, 0]), scaling(wide, length, 1))
        r.drawFills(fills[kind], { model, alpha: a })
        r.drawLines(shapes[kind], { model, alpha: a, reveal: f.reveal })
      }

      // ---- chama: ancorada na ponta de onde vem o gás, avançando sobre a amostra (ilustrativo)
      const o2 = lerp(s.o2[0], s.o2[1] ?? s.o2[0], u)
      const vigor = clamp((o2 - 11) / 11, 0.25, 1)
      const flick = f.still ? 1 : 0.92 + 0.08 * Math.sin(f.now * 11) * Math.sin(f.now * 6.1)
      const front = s.shape === 'Seção esférica' ? base : base + length * lerp(0.02, 0.72, u)
      const reach = (Math.min(body, 7) * 1.1 + 5) * (0.72 + 0.4 * vigor)
      const at: V3 = [0, front + reach * 0.75, 0]
      r.sprite({ at, radius: reach * 2.4, kind: 0, color: 'hot', p: [2.6, 0.16 * vigor, 0, 0], alpha: a, axis: [0, 1, 0], stretch: 1.9 })
      r.sprite({ at, radius: reach / 0.69, kind: 1, color: 'hot', color2: 'red', p: [0.69, 0.07, f.still ? 0 : 0.1, 0.05], alpha: a * vigor * flick, axis: [0, 1, 0], stretch: 1.9, seed: 3 })
      // base azul, virada para o escoamento
      r.sprite({ at: [0, front - reach * 0.15, 0], radius: reach * 1.05, kind: 1, color: 'cool', color2: 'cyan', p: [0.69, 0.1, f.still ? 0 : 0.05, 0.02], alpha: a * 0.75 * flick, seed: 9 })

      // ---- escoamento: traçadores sobem e contornam a amostra
      r.particles({ mode: 1, p0: [HX - 3, HY - 2, HX - 3, 0], p1: [0.17, body + 2, 0, 0], color: 'cyan', alpha: a * 0.55, size: 2, count: 620 })

      if (f.live) dims.push({ at: [0, base + length, 0], width: cross, text: s.size, tone: 'ink', above: true, offset: 14 })
    },
    dims: () => dims,
    dispose() {
      for (const batch of [duct, blades, ...Object.values(shapes), ...Object.values(fills)]) r.free(batch)
    },
  }
}
