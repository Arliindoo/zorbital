/**
 * Cena 1 dos estudos de voo: a Estação Espacial em órbita, em desenho de linhas, sobre a Terra.
 *
 * Unidade: metro. Eixos: +Z é a proa (sentido do voo), +Y o zênite, +X bombordo.
 * As proporções seguem a estação real (treliça de ~109 m, módulos de ~4,3 m de diâmetro), mas é
 * uma maquete esquemática: serve para situar o laboratório, não como planta de engenharia.
 * A Terra está em escala (raio 6 371 km, estação a ~408 km): a curvatura do horizonte é a real.
 */

import type { Fills, Lines, Renderer } from '../engine/renderer'
import { compose, type Mat, rotX, rotZ, translate, type V3 } from '../engine/vec'
import { type Mesh, Wire } from '../engine/wire'
import type { Hotspot, Scene } from '../types'

const TY = 4.6 // altura da treliça
const TZ = 8 // a treliça cruza por cima do Destiny
export const EARTH_R = 6_371_000
export const ISS_ALT = 408_000
const EARTH_C: V3 = [0, -(EARTH_R + ISS_ALT), 0]
export const DESTINY_AT: V3 = [0, 0, 8.3]

function buildStation(): Mesh[] {
  const out: Mesh[] = []
  const w = new Wire()
  const module = { rings: 3, sides: 8, seg: 20 }
  const small = { rings: 2, sides: 6, seg: 14 }

  // ---- treliça integrada e suportes
  w.truss(-25, 25, [TY, TZ], 2.1, 5)
  w.truss(25, 54.5, [TY, TZ], 1.45, 4.9).truss(-54.5, -25, [TY, TZ], 1.45, 4.9)
  for (const sx of [-1.3, 1.3]) for (const z of [6, 10.4]) w.seg([sx, 2.1, z], [sx * 1.2, TY - 2.1, z > TZ ? TZ + 1.6 : TZ - 1.6])
  w.box([0, 3.3, 1.2], [2.6, 2.3, 2.6]) // Z1
  w.box([-12.5, TY + 3.5, TZ], [3, 2.8, 3]) // carga externa
  w.box([19.5, TY + 3, TZ], [3.2, 1.4, 2.4])
  w.box([-20.5, TY - 3, TZ], [3.2, 1.4, 2.4])
  out.push(w.mesh('dim', 0.5, { tag: 'trelica' }))

  // ---- painéis solares: 4 juntas × 2 asas, cada asa com duas mantas e o mastro no meio
  const betas = [0.5, -0.32, 0.24, -0.46]
  ;[-48.5, -34, 34, 48.5].forEach((x, i) => {
    for (const dir of [1, -1]) {
      w.within(compose(translate([x, TY, TZ]), rotZ(betas[i]! * dir)), () => {
        w.seg([0, 0, dir * 1.6], [0, 0, dir * 37])
        for (const side of [-1, 1]) {
          w.quad([side * 0.7, 0, dir * 4], [side * 5.7, 0, dir * 4], [side * 5.7, 0, dir * 37], [side * 0.7, 0, dir * 37], { grid: [2, 15], fill: true })
        }
      })
    }
  })
  // asas dos módulos russos e das naves
  for (const s of [-1, 1]) {
    w.quad([s * 2.4, 0, -27.1], [s * 14.8, 0, -27.1], [s * 14.8, 0, -23.9], [s * 2.4, 0, -23.9], { grid: [6, 1], fill: true })
    w.quad([s * 2.3, -10.6, -17.6], [s * 11.5, -10.6, -17.6], [s * 11.5, -8, -17.6], [s * 2.3, -8, -17.6], { grid: [5, 1], fill: true })
    w.quad([s * 1.2, -12.3, -5.6], [s * 5.2, -12.3, -5.6], [s * 5.2, -11.1, -5.6], [s * 1.2, -11.1, -5.6], { grid: [3, 1], fill: true })
    w.quad([s * 1.2, 0.6, -33], [s * 5.2, 0.6, -33], [s * 5.2, -0.6, -33], [s * 1.2, -0.6, -33], { grid: [3, 1], fill: true })
  }
  out.push(w.mesh('amber', 0.62, { tag: 'solar', fill: 0.075 }))

  // ---- radiadores
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = side * (12 + k * 3.7)
      w.quad([x - 1.6, TY, TZ - 3], [x + 1.6, TY, TZ - 3], [x + 1.6, TY - 1.2, TZ - 25], [x - 1.6, TY - 1.2, TZ - 25], { grid: [1, 8], fill: true })
    }
    const x = side * 41.2
    w.quad([x - 1.6, TY - 1.5, TZ], [x + 1.6, TY - 1.5, TZ], [x + 1.6, TY - 14, TZ], [x - 1.6, TY - 14, TZ], { grid: [1, 5], fill: true })
  }
  out.push(w.mesh('ink', 0.42, { tag: 'radiador', fill: 0.045 }))

  // ---- segmento orbital dos EUA e parceiros (ao longo de Z, da proa para a popa)
  w.tube([0, 0, 12.7], [0, 0, 19.3], 2.2, 2.2, module) // Harmony
  w.tube([0, 0, 19.3], [0, 0, 20.2], 2.2, 1.2, small)
  w.tube([0, 0, 20.2], [0, 0, 22], 1.2, 0.85, small) // adaptador de acoplamento
  w.tube([0, 0, -1.5], [0, 0, 4], 2.25, 2.25, module) // Unity
  w.tube([0, 0, -3.4], [0, 0, -1.5], 0.9, 1.25, small)
  w.tube([-2.3, 0, 16], [-9.2, 0, 16], 2.24, 2.24, { ...module, caps: true }) // Columbus (boreste)
  w.tube([2.3, 0, 16], [13.5, 0, 16], 2.2, 2.2, { rings: 4, sides: 8, seg: 20, caps: true }) // Kibo (bombordo)
  w.tube([9.3, 2.2, 16], [9.3, 6.4, 16], 2.2, 2.2, { ...module, rings: 2, caps: true })
  w.box([16.6, -0.2, 16], [5.6, 2.2, 5])
  w.box([17.6, 1.5, 14.6], [1.6, 1.2, 1.6])
  w.path([[13.6, 1.5, 17.6], [16, 3.6, 18.6], [19, 2.3, 17.6]])
  w.tube([2.4, 0, 1.2], [9.2, 0, 1.2], 2.24, 2.24, module) // Tranquility
  w.tube([7.6, -2.2, 1.2], [7.6, -3.7, 1.2], 1.5, 0.95, { rings: 2, sides: 6, seg: 12 }) // Cupola
  w.tube([6.4, 0, 3.5], [6.4, 0, 10], 2.28, 2.28, { ...module, caps: true })
  w.tube([6.4, 0, -1.1], [6.4, 0, -5.1], 1.6, 1.6, { ...small, caps: true })
  w.tube([-2.4, 0, 1.2], [-5.4, 0, 1.2], 2, 2, { ...module, rings: 2 }) // câmara de despressurização
  w.tube([-5.4, 0, 1.2], [-8.2, 0, 1.2], 1, 1, { ...small, caps: true })
  // braço robótico
  w.path([[3, TY + 2.1, TZ], [8, TY + 7, TZ + 3], [14, TY + 4, TZ + 8], [15.6, TY + 1.4, TZ + 9.6]])
  w.ring([8, TY + 7, TZ + 3], [0, 0, 1], 0.5, 10).ring([14, TY + 4, TZ + 8], [0, 0, 1], 0.5, 10)
  out.push(w.mesh('ink', 0.6, { tag: 'modulos' }))

  // ---- segmento russo
  w.tube([0, 0, -16], [0, 0, -3.4], 2.05, 2.05, { rings: 5, sides: 8, seg: 20 }) // Zarya
  w.tube([0, 0, -19.2], [0, 0, -16], 1.1, 1.45, small) // Zvezda
  w.tube([0, 0, -23], [0, 0, -19.2], 1.45, 1.45, small)
  w.tube([0, 0, -23.6], [0, 0, -23], 1.45, 2.07, small)
  w.tube([0, 0, -28.2], [0, 0, -23.6], 2.07, 2.07, module)
  w.tube([0, 0, -29.4], [0, 0, -28.2], 2.07, 1, small)
  w.tube([0, -1.6, -17.6], [0, -14.5, -17.6], 2.05, 2.05, { rings: 4, sides: 8, seg: 18 }) // Nauka
  w.sphere([0, -16.3, -17.6], 1.6, 2, 3, 16)
  w.tube([0, 1.6, -17.6], [0, 5.6, -17.6], 1.25, 1.25, { ...small, caps: true })
  w.tube([0, -2.1, -5.6], [0, -8.1, -5.6], 1.17, 1.17, small)
  w.tube([0, -8.1, -5.6], [0, -14.8, -5.6], 1.1, 1.1, { rings: 3, sides: 6, seg: 14, caps: true }) // nave de tripulação
  w.tube([0, 0, -36.5], [0, 0, -29.4], 1.1, 1.1, { rings: 3, sides: 6, seg: 14, caps: true }) // cargueiro
  out.push(w.mesh('ink', 0.46, { tag: 'russo' }))

  // ---- nave visitante na proa
  w.tube([0, 0, 22], [0, 0, 24.2], 0.75, 1.9, small)
  w.tube([0, 0, 24.2], [0, 0, 28.2], 1.9, 1.85, { rings: 3, sides: 6, seg: 16, caps: true })
  out.push(w.mesh('dim', 0.5, { tag: 'visitante' }))

  // ---- Destiny: o laboratório onde os experimentos ficam
  w.tube([0, 0, 4.1], [0, 0, 12.6], 2.15, 2.15, { rings: 6, sides: 12, seg: 28 })
  w.ring([0, 0, 8.35], [0, 0, 1], 2.5, 40, { dash: true })
  out.push(w.mesh('signal', 1, { tag: 'destiny', width: 1.5 }))

  // ---- sentido do voo
  w.dashed([0, 0, 30.5], [0, 0, 52], 14)
  w.path([[-1.6, 0, 49.5], [0, 0, 52.5], [1.6, 0, 49.5]])
  out.push(w.mesh('magenta', 0.7, { tag: 'voo' }))
  return out
}

/** Orientação inicial da Terra: põe o ponto (lat, lon) sob a estação, voando no rumo `azimuth`. */
function earthFrame(latDeg: number, lonDeg: number, azimuthDeg: number): Mat {
  const [lat, lon, az] = [latDeg, lonDeg, azimuthDeg].map((d) => (d * Math.PI) / 180) as [number, number, number]
  const up: V3 = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]
  const east: V3 = [Math.cos(lon), 0, -Math.sin(lon)]
  const north: V3 = [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)]
  const ahead: V3 = [north[0] * Math.cos(az) + east[0] * Math.sin(az), north[1] * Math.cos(az) + east[1] * Math.sin(az), north[2] * Math.cos(az) + east[2] * Math.sin(az)]
  const port: V3 = [up[1] * ahead[2] - up[2] * ahead[1], up[2] * ahead[0] - up[0] * ahead[2], up[0] * ahead[1] - up[1] * ahead[0]]
  // linhas = eixos da cena (bombordo, zênite, proa) escritos nas coordenadas do planeta
  return [port[0], port[1], port[2], 0, up[0], up[1], up[2], 0, ahead[0], ahead[1], ahead[2], 0]
}

export function orbitScene<S>(r: Renderer, o: { next: string; sub: string }): Scene<S> {
  const meshes = buildStation()
  const lines: Lines = r.lines(meshes)
  const fills: Fills = r.fills(meshes)
  const frame0 = earthFrame(-8, -52, 42) // sai da Amazônia rumo ao Atlântico Norte
  const sun: V3 = [0.45, 0.5, 0.74]
  // uma volta em ~92 min; aqui o solo anda ~12× mais rápido, só para dar a sensação de órbita
  const omega = ((Math.PI * 2) / (92 * 60)) * 12

  const hotspots: Hotspot[] = [
    { id: 'destiny', at: DESTINY_AT, label: 'Destiny', sub: o.sub, to: o.next, tag: 'destiny', dx: -44, dy: 92 },
    { id: 'trelica', at: [-30, TY + 1.5, TZ], label: 'Treliça principal', sub: '≈ 109 m de ponta a ponta', tag: 'trelica', dx: -30, dy: -56, minor: true },
    { id: 'solar', at: [48.5, TY, TZ + 22], label: 'Painéis solares', sub: '8 asas de ≈ 35 m', tag: 'solar', dx: 30, dy: -46, minor: true },
    { id: 'russo', at: [0, 0, -22], label: 'Segmento russo', sub: 'Zarya · Zvezda · Nauka', tag: 'russo', dx: 44, dy: 50, minor: true },
    { id: 'voo', at: [0, 0, 44], label: 'Sentido do voo', sub: '≈ 7,66 km/s', tag: 'voo', dx: -40, dy: -50, minor: true },
  ]

  return {
    radius: 85,
    near: 2,
    views: {
      main: { pose: { target: [0, 1.5, 4], yaw: 0.78, pitch: 0.2, dist: 172 }, zoom: [48, 460], center: [0.44, 0.44], idle: 'spin', hotspots },
    },
    draw(f) {
      const still = f.still
      r.stars(f.alpha)
      r.planet({
        center: EARTH_C,
        radius: EARTH_R,
        atmosphere: 0.019,
        rotation: compose(rotX(still ? 0 : -f.now * omega), frame0),
        sun,
        grid: [5, 0.5],
        alpha: f.alpha,
      })
      const focus = f.focus ?? 'destiny'
      const amount = f.focus ? 0.9 : 0.25 + 0.12 * Math.sin(f.now * 2.2)
      r.drawFills(fills, { reveal: f.reveal, alpha: f.alpha, focus, focusAmount: amount })
      r.drawLines(lines, { reveal: f.reveal, alpha: f.alpha, focus, focusAmount: amount })
      // o laboratório pulsa: é para lá que a simulação desce
      r.sprite({ at: DESTINY_AT, radius: 13, kind: 0, color: 'signal', p: [2.6, 0.16 + 0.07 * Math.sin(f.now * 2.2), 0, 0], alpha: f.alpha * f.reveal })
    },
    dispose() {
      r.free(lines)
      r.free(fills)
    },
  }
}
