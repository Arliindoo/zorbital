/** Vetores e matrizes mínimos da simulação. Sistema de mão direita, Y para cima. */

export type V3 = readonly [number, number, number]

/** Transformação afim 3×4 em linhas: [m00 m01 m02 tx, m10 m11 m12 ty, m20 m21 m22 tz]. */
export type Mat = readonly [number, number, number, number, number, number, number, number, number, number, number, number]

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
export const unit = (a: V3): V3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const easeOut = (t: number): number => 1 - (1 - t) ** 3
/** 0 antes de `a`, 1 depois de `b`, suave entre os dois. */
export const ramp = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a || 1))
  return t * t * (3 - 2 * t)
}

/** Dois vetores unitários perpendiculares a `axis` (para anéis e tubos em qualquer direção). */
export function basis(axis: V3): [V3, V3] {
  const a = unit(axis)
  const helper: V3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u = unit(cross(helper, a))
  return [u, cross(a, u)]
}

export const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]

export function matMul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[1] * b[4] + a[2] * b[8],
    a[0] * b[1] + a[1] * b[5] + a[2] * b[9],
    a[0] * b[2] + a[1] * b[6] + a[2] * b[10],
    a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
    a[4] * b[0] + a[5] * b[4] + a[6] * b[8],
    a[4] * b[1] + a[5] * b[5] + a[6] * b[9],
    a[4] * b[2] + a[5] * b[6] + a[6] * b[10],
    a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
    a[8] * b[0] + a[9] * b[4] + a[10] * b[8],
    a[8] * b[1] + a[9] * b[5] + a[10] * b[9],
    a[8] * b[2] + a[9] * b[6] + a[10] * b[10],
    a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
  ]
}
/** Composição na ordem de leitura: `compose(a, b)` aplica `b` primeiro, depois `a`. */
export const compose = (...ms: Mat[]): Mat => ms.reduce(matMul)
export const translate = (v: V3): Mat => [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2]]
export const scaling = (x: number, y = x, z = x): Mat => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]
export function rotX(a: number): Mat {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]
}
export function rotY(a: number): Mat {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]
}
export function rotZ(a: number): Mat {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]
}
export const apply = (m: Mat, p: V3): V3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
]
/** Só a parte linear (direções não se deslocam). */
export const turn = (m: Mat, p: V3): V3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2],
]

/** Gerador determinístico: estrelas e partículas ficam no mesmo lugar a cada visita. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
