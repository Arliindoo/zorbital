/**
 * Construtor de malhas em linhas: as "maquetes" da simulação são desenhos estruturais, feitos de
 * segmentos (e de alguns painéis translúcidos). A geometria é montada uma vez na CPU e enviada à GPU
 * num único buffer; depois disso só matrizes e uniformes mudam.
 */

import { apply, basis, IDENTITY, type Mat, matMul, type V3 } from './vec'

/** Cores semânticas: o renderizador as resolve a partir dos tokens do tema. */
export type Tone = 'ink' | 'dim' | 'faint' | 'signal' | 'mint' | 'magenta' | 'hot' | 'cool' | 'amber' | 'violet' | 'cyan' | 'red'

export interface Mesh {
  /** xyz de cada vértice */
  v: number[]
  /** pares de índices (segmentos) */
  e: number[]
  /** trincas de índices (painéis preenchidos) */
  tris: number[]
  tone: Tone
  alpha: number
  /** opacidade dos painéis preenchidos */
  fill: number
  /** espessura do traço em px de CSS */
  width: number
  /** grupo para realce (um marcador da cena acende o grupo de mesmo nome) */
  tag: string | null
}

export interface MeshStyle {
  tag?: string
  fill?: number
  width?: number
}

const TAU = Math.PI * 2

export class Wire {
  private v: number[] = []
  private e: number[] = []
  private tris: number[] = []
  private m: Mat = IDENTITY

  /** Desenha dentro de um referencial local (posição/rotação de uma peça). */
  within(m: Mat, draw: () => void): this {
    const before = this.m
    this.m = matMul(before, m)
    draw()
    this.m = before
    return this
  }

  p(a: V3): number {
    const w = apply(this.m, a)
    this.v.push(w[0], w[1], w[2])
    return this.v.length / 3 - 1
  }

  seg(a: V3, b: V3): this {
    this.e.push(this.p(a), this.p(b))
    return this
  }

  path(points: readonly V3[], closed = false): this {
    const ids = points.map((q) => this.p(q))
    for (let i = 0; i + 1 < ids.length; i++) this.e.push(ids[i]!, ids[i + 1]!)
    if (closed && ids.length > 2) this.e.push(ids.at(-1)!, ids[0]!)
    return this
  }

  /** Linha tracejada: `on` trechos desenhados a cada `on + off`. */
  dashed(a: V3, b: V3, pieces = 12, on = 1, off = 1): this {
    const period = on + off
    for (let i = 0; i < pieces; i++) {
      if (i % period >= on) continue
      const t0 = i / pieces
      const t1 = (i + 1) / pieces
      this.seg(
        [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0],
        [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1],
      )
    }
    return this
  }

  /** Pontos de um círculo em torno de `axis`. */
  private circle(c: V3, axis: V3, r: number, n: number, from = 0, to = TAU): V3[] {
    const [u, w] = basis(axis)
    const out: V3[] = []
    const full = Math.abs(to - from - TAU) < 1e-6
    const steps = full ? n : n + 1
    for (let i = 0; i < steps; i++) {
      const a = from + ((to - from) * i) / n
      const cs = Math.cos(a) * r
      const sn = Math.sin(a) * r
      out.push([c[0] + u[0] * cs + w[0] * sn, c[1] + u[1] * cs + w[1] * sn, c[2] + u[2] * cs + w[2] * sn])
    }
    return out
  }

  ring(c: V3, axis: V3, r: number, n = 32, o: { dash?: boolean; from?: number; to?: number; fill?: boolean } = {}): this {
    const from = o.from ?? 0
    const to = o.to ?? TAU
    const pts = this.circle(c, axis, r, n, from, to)
    const closed = Math.abs(to - from - TAU) < 1e-6
    const ids = pts.map((q) => this.p(q))
    const count = closed ? ids.length : ids.length - 1
    for (let i = 0; i < count; i++) {
      if (o.dash && i % 2) continue
      this.e.push(ids[i]!, ids[(i + 1) % ids.length]!)
    }
    if (o.fill && closed) {
      const hub = this.p(c)
      for (let i = 0; i < ids.length; i++) this.tris.push(hub, ids[i]!, ids[(i + 1) % ids.length]!)
    }
    return this
  }

  /** Tubo (ou tronco de cone) entre `a` e `b`: anéis + longarinas. */
  tube(a: V3, b: V3, r0: number, r1 = r0, o: { sides?: number; rings?: number; seg?: number; caps?: boolean } = {}): this {
    const seg = o.seg ?? 24
    const rings = Math.max(2, o.rings ?? 2)
    const sides = o.sides ?? 8
    const axis: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const rows: number[][] = []
    for (let k = 0; k < rings; k++) {
      const t = k / (rings - 1)
      const c: V3 = [a[0] + axis[0] * t, a[1] + axis[1] * t, a[2] + axis[2] * t]
      const ids = this.circle(c, axis, r0 + (r1 - r0) * t, seg).map((q) => this.p(q))
      for (let i = 0; i < seg; i++) this.e.push(ids[i]!, ids[(i + 1) % seg]!)
      rows.push(ids)
    }
    for (let s = 0; s < sides; s++) {
      const i = Math.round((s * seg) / sides) % seg
      this.e.push(rows[0]![i]!, rows.at(-1)![i]!)
    }
    if (o.caps) {
      for (const [c, row] of [[a, rows[0]!], [b, rows.at(-1)!]] as const) {
        const hub = this.p(c)
        for (let s = 0; s < sides; s += 2) this.e.push(hub, row[Math.round((s * seg) / sides) % seg]!)
      }
    }
    return this
  }

  /** Caixa alinhada aos eixos do referencial atual; `s` são os tamanhos totais. */
  box(c: V3, s: V3, o: { fill?: readonly ('x' | '-x' | 'y' | '-y' | 'z' | '-z')[] } = {}): this {
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2]
    const ids: number[] = []
    for (let i = 0; i < 8; i++) ids.push(this.p([c[0] + (i & 1 ? hx : -hx), c[1] + (i & 2 ? hy : -hy), c[2] + (i & 4 ? hz : -hz)]))
    for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const) this.e.push(ids[i]!, ids[j]!)
    const faces = { x: [1, 3, 7, 5], '-x': [0, 2, 6, 4], y: [2, 3, 7, 6], '-y': [0, 1, 5, 4], z: [4, 5, 7, 6], '-z': [0, 1, 3, 2] } as const
    for (const f of o.fill ?? []) {
      const [a, b, d, e] = faces[f]
      this.tris.push(ids[a]!, ids[b]!, ids[d]!, ids[a]!, ids[d]!, ids[e]!)
    }
    return this
  }

  /** Quadrilátero a–b–c–d com grade interna opcional e preenchimento translúcido. */
  quad(a: V3, b: V3, c: V3, d: V3, o: { grid?: readonly [number, number]; fill?: boolean; frame?: boolean } = {}): this {
    const at = (s: number, t: number): V3 => [
      (a[0] * (1 - s) + b[0] * s) * (1 - t) + (d[0] * (1 - s) + c[0] * s) * t,
      (a[1] * (1 - s) + b[1] * s) * (1 - t) + (d[1] * (1 - s) + c[1] * s) * t,
      (a[2] * (1 - s) + b[2] * s) * (1 - t) + (d[2] * (1 - s) + c[2] * s) * t,
    ]
    if (o.frame !== false) this.path([a, b, c, d], true)
    const [nu, nv] = o.grid ?? [0, 0]
    for (let i = 1; i < nu; i++) this.seg(at(i / nu, 0), at(i / nu, 1))
    for (let j = 1; j < nv; j++) this.seg(at(0, j / nv), at(1, j / nv))
    if (o.fill) {
      const [ia, ib, ic, id] = [this.p(a), this.p(b), this.p(c), this.p(d)]
      this.tris.push(ia, ib, ic, ia, ic, id)
    }
    return this
  }

  /** Esfera em paralelos e meridianos. */
  sphere(c: V3, r: number, lat = 5, lon = 8, seg = 32): this {
    for (let i = 1; i <= lat; i++) {
      const phi = -Math.PI / 2 + (Math.PI * i) / (lat + 1)
      this.ring([c[0], c[1] + Math.sin(phi) * r, c[2]], [0, 1, 0], Math.cos(phi) * r, seg)
    }
    for (let j = 0; j < lon; j++) {
      const a = (Math.PI * j) / lon
      this.ring(c, [Math.cos(a), 0, Math.sin(a)], r, seg)
    }
    return this
  }

  /** Treliça de caixa ao longo de X, entre x0 e x1: longarinas, quadros e diagonais alternadas. */
  truss(x0: number, x1: number, c: readonly [number, number], half: number, bay: number): this {
    const [cy, cz] = c
    const corners: readonly [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / bay))
    for (const [sy, sz] of corners) this.seg([x0, cy + sy * half, cz + sz * half], [x1, cy + sy * half, cz + sz * half])
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n
      this.path(corners.map(([sy, sz]) => [x, cy + sy * half, cz + sz * half] as V3), true)
      if (i === n) break
      const xn = x0 + ((x1 - x0) * (i + 1)) / n
      const flip = i % 2 === 0
      for (let k = 0; k < 4; k++) {
        const [ay, az] = corners[flip ? k : (k + 1) % 4]!
        const [by, bz] = corners[flip ? (k + 1) % 4 : k]!
        this.seg([x, cy + ay * half, cz + az * half], [xn, cy + by * half, cz + bz * half])
      }
    }
    return this
  }

  /** Marcas de régua ao longo de a→b, perpendiculares em `side`. */
  ticks(a: V3, b: V3, side: V3, count: number, major = 5, size = 1): this {
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
      const k = (i % major === 0 ? 1 : 0.45) * size
      this.seg(q, [q[0] + side[0] * k, q[1] + side[1] * k, q[2] + side[2] * k])
    }
    return this
  }

  /** Fecha a peça: devolve a malha e esvazia o construtor para a próxima. */
  mesh(tone: Tone, alpha: number, style: MeshStyle = {}): Mesh {
    const out: Mesh = { v: this.v, e: this.e, tris: this.tris, tone, alpha, fill: style.fill ?? 0.06, width: style.width ?? 1.15, tag: style.tag ?? null }
    this.v = []
    this.e = []
    this.tris = []
    return out
  }
}
