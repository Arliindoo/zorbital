/**
 * Cena 2 dos estudos de voo: o laboratório Destiny em corte, com as baias de rack e o rack do
 * experimento aberto — o CIR (gotas: FLEX, CFI) ou a MSG (sólidos: BASS-II).
 *
 * Unidade: metro. O eixo do módulo é Z; o rack em destaque fica na parede +X, na altura do olho.
 * Maquete esquemática: dimensões gerais reais (8,5 m × ⌀ 4,3 m, 24 baias), interior simplificado.
 * A posição do rack dentro do módulo é ilustrativa.
 */

import type { Fills, Lines, Renderer } from '../engine/renderer'
import { compose, rotX, rotZ, translate, type V3 } from '../engine/vec'
import { type Mesh, Wire } from '../engine/wire'
import type { Hotspot, Readout, Scene, SimRun } from '../types'

const R_HULL = 2.15
const FRONT = 1.06 // distância do eixo à face dos racks
const BACK = 1.84
const BAYS = [-2.65, -1.59, -0.53, 0.53, 1.59, 2.65]
const ZC = 0.53 // baia do rack em destaque
export const RACK_CORE: V3 = [1.42, 0.22, ZC]

export type RackKind = 'cir' | 'msg'

/** Um pacote de diagnóstico do rack: acende quando o ensaio selecionado o usou. */
export interface Diagnostic {
  id: string
  label: string
  on: boolean
}

function shell(w: Wire): Mesh {
  w.tube([0, 0, -4.25], [0, 0, 4.25], R_HULL, R_HULL, { rings: 11, sides: 12, seg: 40 })
  for (const s of [-1, 1]) {
    w.tube([0, 0, s * 4.25], [0, 0, s * 4.9], R_HULL, 1.02, { rings: 2, sides: 8, seg: 32 })
    w.ring([0, 0, s * 4.9], [0, 0, 1], 0.72, 28)
    w.path([[-0.62, -0.62, s * 4.9], [0.62, -0.62, s * 4.9], [0.62, 0.62, s * 4.9], [-0.62, 0.62, s * 4.9]], true)
  }
  return w.mesh('dim', 0.2, { tag: 'casco' })
}

function racks(w: Wire): Mesh {
  const half = Math.asin(0.95 / 2.07)
  for (let wall = 0; wall < 4; wall++) {
    w.within(rotZ((wall * Math.PI) / 2), () => {
      for (const z of BAYS) {
        if (wall === 0 && z === ZC) continue
        w.path([[FRONT, -0.95, z - 0.5], [FRONT, 0.95, z - 0.5], [FRONT, 0.95, z + 0.5], [FRONT, -0.95, z + 0.5]], true)
        w.path([[FRONT, -0.78, z - 0.38], [FRONT, 0.78, z - 0.38], [FRONT, 0.78, z + 0.38], [FRONT, -0.78, z + 0.38]], true)
        for (const sy of [-0.95, 0.95]) w.seg([FRONT, sy, z + 0.5], [BACK, sy, z + 0.5])
        w.ring([0, 0, z + 0.5], [0, 0, 1], 2.07, 6, { from: -half, to: half })
      }
      // perfis que separam as quatro fileiras de racks
      for (const sy of [-1.06, 1.06]) w.seg([FRONT, sy, -3.3], [FRONT, sy, 3.3])
    })
  }
  return w.mesh('faint', 0.5, { tag: 'baias' })
}

function rackFrame(w: Wire): Mesh {
  const half = Math.asin(0.95 / 2.07)
  for (const z of [ZC - 0.5, ZC + 0.5]) {
    w.path([[FRONT, -0.95, z], [BACK, -0.95, z]])
    w.path([[FRONT, 0.95, z], [BACK, 0.95, z]])
    w.ring([0, 0, z], [0, 0, 1], 2.07, 8, { from: -half, to: half })
  }
  for (const sy of [-0.95, 0.95]) w.seg([BACK, sy, ZC - 0.5], [BACK, sy, ZC + 0.5])
  w.quad([FRONT, -0.95, ZC - 0.5], [FRONT, 0.95, ZC - 0.5], [FRONT, 0.95, ZC + 0.5], [FRONT, -0.95, ZC + 0.5], { fill: true })
  w.path([[FRONT, -0.88, ZC - 0.45], [FRONT, 0.88, ZC - 0.45], [FRONT, 0.88, ZC + 0.45], [FRONT, -0.88, ZC + 0.45]], true)
  return w.mesh('signal', 0.95, { tag: 'rack', width: 1.45, fill: 0.05 })
}

/** Interior do CIR: bancada óptica, câmara de combustão com janelas, garrafas de gás. */
function cirCore(w: Wire): Mesh[] {
  const [, cy, cz] = RACK_CORE
  const out: Mesh[] = []
  // câmara: cilindro com o eixo para o fundo do rack, tampa frontal e 8 janelas
  w.tube([1.12, cy, cz], [1.78, cy, cz], 0.2, 0.2, { rings: 4, sides: 8, seg: 22, caps: true })
  w.ring([1.12, cy, cz], [1, 0, 0], 0.13, 18)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    w.ring([1.45, cy + 0.2 * Math.cos(a), cz + 0.2 * Math.sin(a)], [0, Math.cos(a), Math.sin(a)], 0.05, 10)
  }
  out.push(w.mesh('mint', 0.95, { tag: 'camara', width: 1.4 }))
  // bancada óptica: a placa onde a câmara e as câmeras ficam presas
  w.ring([1.34, cy, cz], [1, 0, 0], 0.46, 8)
  w.ring([1.34, cy, cz], [1, 0, 0], 0.235, 24)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8
    w.seg([1.34, cy + 0.235 * Math.cos(a), cz + 0.235 * Math.sin(a)], [1.34, cy + 0.46 * Math.cos(a), cz + 0.46 * Math.sin(a)])
  }
  out.push(w.mesh('ink', 0.5, { tag: 'bancada' }))
  // garrafas de gás e aviônica, na metade de baixo
  for (let k = 0; k < 3; k++) w.tube([1.4, -0.36 - 0.15 * k, cz - 0.38], [1.4, -0.36 - 0.15 * k, cz + 0.38], 0.062, 0.062, { rings: 2, sides: 4, seg: 12, caps: true })
  w.box([1.44, -0.84, cz], [0.62, 0.16, 0.86])
  w.seg([1.13, -0.84, cz - 0.3], [1.13, -0.84, cz + 0.3])
  out.push(w.mesh('dim', 0.55, { tag: 'gas' }))
  return out
}

/** Onde ficam os pacotes de diagnóstico em volta da câmara (ângulo na bancada). */
const DIAG_ANGLES = [0.55, 2.2, 3.75, 5.3]

function diagBox(w: Wire, index: number): Mesh {
  const [, cy, cz] = RACK_CORE
  const a = DIAG_ANGLES[index % DIAG_ANGLES.length]!
  const c: V3 = [1.26, cy + 0.34 * Math.cos(a), cz + 0.34 * Math.sin(a)]
  w.within(compose(translate(c), rotX(a)), () => {
    w.box([0, 0, 0], [0.2, 0.13, 0.13])
    w.ring([-0.1, 0, 0], [1, 0, 0], 0.04, 10)
    w.seg([0, -0.065, 0], [0, -0.14, 0]) // visada para a janela
  })
  return w.mesh('cyan', 1, { width: 1.3 })
}

/** Interior da MSG: volume de trabalho com portas de luva e o duto do BASS lá dentro. */
function msgCore(w: Wire): Mesh[] {
  const [, cy, cz] = RACK_CORE
  const out: Mesh[] = []
  w.box([1.42, cy, cz], [0.52, 0.62, 0.9])
  w.quad([FRONT + 0.1, cy - 0.31, cz - 0.45], [FRONT + 0.1, cy + 0.31, cz - 0.45], [FRONT + 0.1, cy + 0.31, cz + 0.45], [FRONT + 0.1, cy - 0.31, cz + 0.45], { fill: true, frame: false })
  for (const s of [-1, 1]) {
    w.ring([FRONT + 0.1, cy - 0.12, cz + s * 0.22], [1, 0, 0], 0.1, 20) // portas de luva
    w.ring([FRONT + 0.1, cy + 0.2, cz + s * 0.31], [1, 0, 0], 0.07, 16)
    w.ring([1.42, cy, cz + s * 0.45], [0, 0, 1], 0.2, 22) // portas laterais
  }
  out.push(w.mesh('mint', 0.9, { tag: 'camara', width: 1.4, fill: 0.04 }))
  // duto de escoamento do BASS (≈ 7,6 × 7,6 × 17 cm), ventilador embaixo, câmera ao lado
  w.box([1.44, cy - 0.06, cz], [0.076, 0.17, 0.076])
  w.tube([1.44, cy - 0.2, cz], [1.44, cy - 0.145, cz], 0.045, 0.045, { rings: 2, sides: 4, seg: 12 })
  w.box([1.3, cy - 0.04, cz + 0.2], [0.09, 0.07, 0.12])
  w.seg([1.3, cy - 0.04, cz + 0.14], [1.42, cy - 0.05, cz + 0.04])
  out.push(w.mesh('ink', 0.95, { tag: 'duto', width: 1.4 }))
  // gavetas e eletrônica, embaixo
  w.box([1.42, -0.46, cz], [0.6, 0.34, 0.9])
  w.seg([FRONT + 0.12, -0.46, cz - 0.45], [FRONT + 0.12, -0.46, cz + 0.45])
  w.box([1.42, -0.82, cz], [0.6, 0.2, 0.9])
  out.push(w.mesh('dim', 0.5, { tag: 'gas' }))
  return out
}

/** Figura humana, só para dar a escala (≈ 1,75 m), flutuando diante do rack. */
function figure(w: Wire): Mesh {
  w.within(compose(translate([-0.05, -0.12, ZC - 0.25]), rotZ(0.14), rotX(-0.18)), () => {
    w.sphere([0, 0.74, 0], 0.115, 2, 3, 14)
    w.tube([0, 0.58, 0], [0, 0.02, 0], 0.2, 0.15, { rings: 3, sides: 4, seg: 12 })
    w.path([[0.2, 0.52, 0], [0.5, 0.36, 0.04], [0.82, 0.42, 0.02]]) // braço que alcança o rack
    w.path([[-0.2, 0.52, 0], [-0.34, 0.22, 0.1], [-0.2, -0.02, 0.2]])
    w.path([[0.09, 0.02, 0], [0.16, -0.42, 0.1], [0.1, -0.86, -0.04]])
    w.path([[-0.09, 0.02, 0], [-0.2, -0.4, 0.16], [-0.22, -0.84, 0.3]])
  })
  return w.mesh('dim', 0.75, { tag: 'figura' })
}

export interface LabOptions<S> {
  rack: RackKind
  next: string
  /** pacotes de diagnóstico do ensaio selecionado (até 4) */
  diagnostics?: (run: SimRun<S> | null) => readonly Diagnostic[]
  /** cor do brilho que marca o experimento dentro do rack */
  glow: 'hot' | 'cool'
}

export function labScene<S>(r: Renderer, o: LabOptions<S>): Scene<S> {
  const w = new Wire()
  const meshes: Mesh[] = [shell(w), racks(w), rackFrame(w), ...(o.rack === 'cir' ? cirCore(w) : msgCore(w)), figure(w)]
  const lines: Lines = r.lines(meshes)
  const fills: Fills = r.fills(meshes)
  const diag: Lines[] = o.rack === 'cir' ? DIAG_ANGLES.map((_, i) => r.lines([diagBox(w, i)])) : []

  const cir = o.rack === 'cir'
  const hotspots: Hotspot[] = [
    cir
      ? { id: 'rack', at: [1.12, 0.22, ZC], label: 'CIR', sub: 'Combustion Integrated Rack · entrar na câmara', to: o.next, tag: 'camara', dx: -40, dy: -110 }
      : { id: 'rack', at: [1.44, 0.16, ZC], label: 'MSG', sub: 'Microgravity Science Glovebox · entrar no duto', to: o.next, tag: 'duto', dx: -40, dy: -110 },
    { id: 'casco', at: [0, R_HULL, -2.6], label: 'Destiny', sub: '8,5 m × ⌀ 4,3 m · 24 baias de rack', tag: 'casco', dx: -30, dy: -50, minor: true },
    { id: 'figura', at: [-0.02, 0.66, ZC - 0.25], label: 'Escala humana', sub: '≈ 1,75 m', tag: 'figura', dx: -70, dy: 20, minor: true },
    cir
      ? { id: 'gas', at: [1.4, -0.5, ZC - 0.3], label: 'Gases', sub: 'garrafas de oxidante e diluente', tag: 'gas', dx: -64, dy: 46, minor: true }
      : { id: 'gas', at: [1.2, 0.1, ZC + 0.22], label: 'Portas de luva', sub: 'o astronauta troca as amostras', tag: 'camara', dx: 40, dy: 60, minor: true },
  ]

  return {
    radius: 5,
    near: 0.08,
    views: {
      main: { pose: { target: [0.75, 0.05, ZC - 0.1], yaw: -1.08, pitch: 0.2, dist: 7.8 }, zoom: [1.7, 17], center: [0.43, 0.47], hotspots },
    },
    draw(f) {
      r.stars(f.alpha * 0.5)
      const focus = f.focus ?? (cir ? 'camara' : 'duto')
      const amount = f.focus ? 0.85 : 0.18 + 0.1 * Math.sin(f.now * 2.2)
      r.drawFills(fills, { reveal: f.reveal, alpha: f.alpha, focus, focusAmount: amount })
      r.drawLines(lines, { reveal: f.reveal, alpha: f.alpha, focus, focusAmount: amount })
      const list = o.diagnostics?.(f.run) ?? []
      diag.forEach((batch, i) => {
        const item = list[i]
        // sem dado do ensaio, os pacotes aparecem apagados (existem no rack, mas nada diz que gravaram)
        r.drawLines(batch, { reveal: f.reveal, alpha: f.alpha * (item?.on ? 1 : 0.22) })
      })
      // a chama está aqui dentro
      const core: V3 = cir ? [1.45, RACK_CORE[1], ZC] : [1.44, RACK_CORE[1] - 0.06, ZC]
      r.sprite({ at: core, radius: cir ? 0.3 : 0.2, kind: 0, color: o.glow, p: [2.4, 0.42 + 0.16 * Math.sin(f.now * 5.1) * Math.sin(f.now * 1.7), 0, 0], alpha: f.alpha * f.reveal })
    },
    dispose() {
      r.free(lines)
      r.free(fills)
      for (const batch of diag) r.free(batch)
    },
  }
}

/** Fatos da cena do laboratório que valem para qualquer estudo de voo. */
export const LAB_FACTS: readonly Readout[] = [
  { label: 'Módulo', value: 'Destiny', hint: 'Laboratório dos EUA na ISS' },
  { label: 'Tamanho', value: '8,5 × ⌀ 4,3', unit: 'm' },
  { label: 'Baias de rack', value: '24' },
]
