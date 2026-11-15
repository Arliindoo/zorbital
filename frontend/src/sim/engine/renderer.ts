/**
 * Renderizador WebGL2 da simulação.
 *
 * Regras de desempenho que valem aqui:
 *  - geometria estática vai para a GPU uma vez (um buffer intercalado + VAO por lote) e cada lote é
 *    uma chamada de desenho instanciada; por quadro só mudam uniformes e matrizes;
 *  - nenhuma alocação no laço de desenho (matrizes e vetores de trabalho são reaproveitados);
 *  - sem buffer de profundidade nem MSAA: as linhas são suavizadas no fragmento e a oclusão pela
 *    Terra é analítica no vértice;
 *  - a resolução interna se ajusta ao tempo de quadro (ver `Director`).
 */

import { t } from '@/lib/i18n'
import { LAND_H, LAND_W, landMask } from './land'
import { FILL_FS, FILL_VS, LINE_FS, LINE_VS, PARTICLE_FS, PARTICLE_VS, PLANET_FS, PLANET_VS, SPRITE_FS, SPRITE_VS, STAR_FS, STAR_VS } from './shaders'
import { apply, cross, IDENTITY, type Mat, matMul, rng, sub, turn, unit, type V3 } from './vec'
import type { Mesh, Tone } from './wire'

export interface Pose {
  target: V3
  yaw: number
  pitch: number
  dist: number
}

export interface Projected {
  x: number
  y: number
  /** px de CSS por unidade da cena, nessa profundidade */
  scale: number
  depth: number
  front: boolean
}

export interface Lines {
  vao: WebGLVertexArrayObject
  buffer: WebGLBuffer
  count: number
}
export type Fills = Lines
export type Points = Lines

export interface LineOpts {
  model?: Mat
  reveal?: number
  alpha?: number
  /** grupo em realce e intensidade (0..1) */
  focus?: string | null
  focusAmount?: number
  /** esfera que esconde o que está atrás dela (em coordenadas da cena) */
  occluder?: { center: V3; radius: number } | null
}

export interface SpriteOpts {
  at: V3
  radius: number
  kind: 0 | 1 | 2 | 3 | 4 | 5
  color: Tone | V3
  color2?: Tone | V3
  p?: readonly [number, number, number, number]
  alpha?: number
  seed?: number
  blend?: 'add' | 'over'
  /** alongar ao longo de um eixo da cena (elipsoide de revolução) */
  axis?: V3
  stretch?: number
  /** em vez de olhar para a câmera, deitar no plano definido por dois semieixos da cena */
  plane?: readonly [V3, V3]
  data?: WebGLTexture | null
  model?: Mat
}

export interface ParticleOpts {
  mode: 0 | 1 | 2
  p0: readonly [number, number, number, number]
  p1: readonly [number, number, number, number]
  color: Tone | V3
  color2?: Tone | V3
  alpha?: number
  size?: number
  count?: number
  model?: Mat
}

export interface PlanetOpts {
  center: V3
  radius: number
  /** espessura visual da atmosfera, em fração do raio */
  atmosphere: number
  /** orientação do planeta (Y local = polo norte) */
  rotation: Mat
  sun: V3
  /** passo da grade e dos pontos de continente, em graus */
  grid: readonly [number, number]
  alpha?: number
}

interface Program {
  p: WebGLProgram
  u: Record<string, WebGLUniformLocation | null>
}

const TOKENS: Record<Tone, string> = {
  ink: '--ink',
  dim: '--ink-2',
  faint: '--ink-3',
  signal: '--signal',
  mint: '--signal-2',
  magenta: '--magenta',
  hot: '--s3',
  cool: '--s4',
  amber: '--amber',
  violet: '--violet',
  cyan: '--cyan',
  red: '--red',
}
const FALLBACK: Record<Tone, V3> = {
  ink: [0.95, 0.95, 0.93],
  dim: [0.66, 0.65, 0.64],
  faint: [0.42, 0.42, 0.4],
  signal: [0.13, 0.83, 0.6],
  mint: [0.48, 0.94, 0.78],
  magenta: [1, 0.35, 0.63],
  hot: [1, 0.48, 0.24],
  cool: [0.29, 0.64, 1],
  amber: [0.91, 0.66, 0.11],
  violet: [0.67, 0.56, 1],
  cyan: [0.17, 0.77, 0.86],
  red: [0.94, 0.39, 0.39],
}

function parseColor(text: string): V3 | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())
  if (hex) {
    const h = hex[1]!
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
    return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255]
  }
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text)
  return rgb ? [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255] : null
}

const FOV = 0.62 // ~35,5° na vertical
const LINE_STRIDE = 40
const FILL_STRIDE = 24

export class Renderer {
  readonly gl: WebGL2RenderingContext
  readonly canvas: HTMLCanvasElement
  /** tamanho em px de CSS */
  width = 1
  height = 1
  /** px do dispositivo por px de CSS, já com o ajuste dinâmico */
  px = 1
  time = 0
  readonly palette: Record<Tone, V3>

  private lineProgram: Program
  private fillProgram: Program
  private starProgram: Program
  private planetProgram: Program
  private spriteProgram: Program
  private particleProgram: Program
  private corner: WebGLBuffer
  private spriteVao: WebGLVertexArrayObject
  private spriteQuad: WebGLBuffer
  private emptyVao: WebGLVertexArrayObject
  private starField: Points
  private seeds: Points
  private land: WebGLTexture
  private blank: WebGLTexture
  private tags = new Map<string, number>()
  private blend: 'add' | 'over' | null = null

  // câmera do quadro atual
  private view: Mat = IDENTITY
  private proj = new Float32Array(4)
  private focal = 1
  private cx = 0
  private cy = 0
  near = 0.05
  private fog = new Float32Array([0, 1, 0.3])
  eye: V3 = [0, 0, 1]
  right: V3 = [1, 0, 0]
  up: V3 = [0, 1, 0]
  forward: V3 = [0, 0, -1]

  // áreas de trabalho, para não alocar por quadro
  private m4 = new Float32Array(16)
  private m3 = new Float32Array(9)

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
    if (!gl) throw new Error(t('WebGL2 unavailable', 'WebGL2 indisponível'))
    this.gl = gl
    this.canvas = canvas
    this.palette = this.readPalette()

    this.lineProgram = this.program(LINE_VS, LINE_FS)
    this.fillProgram = this.program(FILL_VS, FILL_FS)
    this.starProgram = this.program(STAR_VS, STAR_FS)
    this.planetProgram = this.program(PLANET_VS, PLANET_FS)
    this.spriteProgram = this.program(SPRITE_VS, SPRITE_FS)
    this.particleProgram = this.program(PARTICLE_VS, PARTICLE_FS)

    // os dois triângulos de um segmento: x ao longo (0..1), y de lado (−1..1)
    this.corner = this.buffer(new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]))
    this.spriteVao = gl.createVertexArray()!
    gl.bindVertexArray(this.spriteVao)
    this.spriteQuad = this.buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]))
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.emptyVao = gl.createVertexArray()!
    gl.bindVertexArray(null)

    this.starField = this.makeStars(1400, 7)
    this.seeds = this.makeSeeds(4096, 11)
    this.land = this.texture(LAND_W, LAND_H, landMask(), gl.REPEAT)
    this.blank = this.texture(1, 1, new Uint8Array([0]), gl.CLAMP_TO_EDGE)

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.clearColor(0, 0, 0, 0)
  }

  // ---------- recursos -----------------------------------------------------------------------

  private readPalette(): Record<Tone, V3> {
    const css = getComputedStyle(this.canvas)
    const out = {} as Record<Tone, V3>
    for (const tone of Object.keys(TOKENS) as Tone[]) out[tone] = parseColor(css.getPropertyValue(TOKENS[tone])) ?? FALLBACK[tone]
    return out
  }

  private shader(type: number, source: string): WebGLShader {
    const gl = this.gl
    const s = gl.createShader(type)!
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`Shader: ${gl.getShaderInfoLog(s) ?? ''}`)
    return s
  }

  private program(vs: string, fs: string): Program {
    const gl = this.gl
    const p = gl.createProgram()!
    const v = this.shader(gl.VERTEX_SHADER, vs)
    const f = this.shader(gl.FRAGMENT_SHADER, fs)
    gl.attachShader(p, v)
    gl.attachShader(p, f)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(t(`Program: ${gl.getProgramInfoLog(p) ?? ''}`, `Programa: ${gl.getProgramInfoLog(p) ?? ''}`))
    gl.deleteShader(v)
    gl.deleteShader(f)
    const u: Program['u'] = {}
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)
      if (info) u[info.name] = gl.getUniformLocation(p, info.name)
    }
    return { p, u }
  }

  private buffer(data: BufferSource): WebGLBuffer {
    const gl = this.gl
    const b = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    return b
  }

  private texture(w: number, h: number, data: Uint8Array, wrapS: number): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  /** Perfil 1D (valores em 0..1) como textura: é assim que uma curva medida pinta a cena. */
  dataTexture(values: ArrayLike<number>): WebGLTexture {
    const bytes = new Uint8Array(values.length)
    for (let i = 0; i < values.length; i++) bytes[i] = Math.round(Math.min(1, Math.max(0, values[i]!)) * 255)
    return this.texture(values.length, 1, bytes, this.gl.CLAMP_TO_EDGE)
  }

  deleteTexture(t: WebGLTexture | null): void {
    if (t) this.gl.deleteTexture(t)
  }

  private tagId(tag: string | null): number {
    if (!tag) return 0
    let id = this.tags.get(tag)
    if (id === undefined) {
      id = this.tags.size + 1
      this.tags.set(tag, id)
    }
    return id
  }

  /** Funde várias malhas num único lote de segmentos instanciados (uma chamada de desenho). */
  lines(meshes: readonly Mesh[]): Lines {
    const gl = this.gl
    const total = meshes.reduce((s, m) => s + m.e.length / 2, 0)
    const raw = new ArrayBuffer(Math.max(1, total) * LINE_STRIDE)
    const f = new Float32Array(raw)
    const b = new Uint8Array(raw)
    let k = 0
    meshes.forEach((m, index) => {
      const rgb = this.palette[m.tone]
      const tag = this.tagId(m.tag)
      const n = m.e.length / 2
      const base = meshes.length > 1 ? (index / meshes.length) * 0.72 : 0
      const share = meshes.length > 1 ? 0.28 : 1
      for (let i = 0; i < n; i++, k++) {
        const ia = m.e[i * 2]! * 3
        const ib = m.e[i * 2 + 1]! * 3
        const o = k * 10
        f[o] = m.v[ia]!
        f[o + 1] = m.v[ia + 1]!
        f[o + 2] = m.v[ia + 2]!
        f[o + 3] = m.v[ib]!
        f[o + 4] = m.v[ib + 1]!
        f[o + 5] = m.v[ib + 2]!
        const c = k * LINE_STRIDE + 24
        b[c] = rgb[0] * 255
        b[c + 1] = rgb[1] * 255
        b[c + 2] = rgb[2] * 255
        b[c + 3] = Math.min(1, m.alpha) * 255
        f[o + 7] = base + (i / Math.max(1, n)) * share
        f[o + 8] = tag
        f[o + 9] = m.width
      }
    })
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const buffer = this.buffer(raw)
    const attr = (loc: number, size: number, type: number, norm: boolean, offset: number) => {
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, type, norm, LINE_STRIDE, offset)
      gl.vertexAttribDivisor(loc, 1)
    }
    attr(1, 3, gl.FLOAT, false, 0)
    attr(2, 3, gl.FLOAT, false, 12)
    attr(3, 4, gl.UNSIGNED_BYTE, true, 24)
    attr(4, 3, gl.FLOAT, false, 28)
    gl.bindVertexArray(null)
    return { vao, buffer, count: total }
  }

  /** Painéis preenchidos das malhas, num único lote de triângulos. */
  fills(meshes: readonly Mesh[]): Fills {
    const gl = this.gl
    const total = meshes.reduce((s, m) => s + m.tris.length, 0)
    const raw = new ArrayBuffer(Math.max(1, total) * FILL_STRIDE)
    const f = new Float32Array(raw)
    const b = new Uint8Array(raw)
    let k = 0
    meshes.forEach((m, index) => {
      const rgb = this.palette[m.tone]
      const tag = this.tagId(m.tag)
      const order = meshes.length > 1 ? index / meshes.length : 0
      for (const vi of m.tris) {
        const o = k * 6
        f[o] = m.v[vi * 3]!
        f[o + 1] = m.v[vi * 3 + 1]!
        f[o + 2] = m.v[vi * 3 + 2]!
        const c = k * FILL_STRIDE + 12
        b[c] = rgb[0] * 255
        b[c + 1] = rgb[1] * 255
        b[c + 2] = rgb[2] * 255
        b[c + 3] = Math.min(1, m.fill) * 255
        f[o + 4] = order
        f[o + 5] = tag
        k++
      }
    })
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const buffer = this.buffer(raw)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, FILL_STRIDE, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, FILL_STRIDE, 12)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, FILL_STRIDE, 16)
    gl.bindVertexArray(null)
    return { vao, buffer, count: total }
  }

  free(batch: Lines | null | undefined): void {
    if (!batch) return
    this.gl.deleteVertexArray(batch.vao)
    this.gl.deleteBuffer(batch.buffer)
  }

  private makeStars(count: number, seed: number): Points {
    const gl = this.gl
    const rand = rng(seed)
    const data = new Float32Array(count * 10)
    const tints: V3[] = [[1, 1, 1], [1, 1, 1], [0.8, 0.88, 1], [1, 0.9, 0.78], this.palette.mint, this.palette.magenta]
    for (let i = 0; i < count; i++) {
      const z = 1 - 2 * rand()
      const r = Math.sqrt(1 - z * z)
      const a = rand() * Math.PI * 2
      const mag = rand() ** 3.2 // poucas brilhantes, muitas fracas
      const tint = tints[Math.floor(rand() * (mag > 0.5 ? tints.length : 4))]!
      data.set([r * Math.cos(a), z, r * Math.sin(a), 1.1 + mag * 2.4, rand() * 6.28, 0.22 + mag * 0.78, 0.6 + rand() * 2.2, tint[0], tint[1], tint[2]], i * 10)
    }
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const buffer = this.buffer(data)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 12)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 28)
    gl.bindVertexArray(null)
    return { vao, buffer, count }
  }

  private makeSeeds(count: number, seed: number): Points {
    const gl = this.gl
    const rand = rng(seed)
    const data = new Float32Array(count * 4)
    for (let i = 0; i < data.length; i++) data[i] = rand()
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const buffer = this.buffer(data)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    return { vao, buffer, count }
  }

  // ---------- quadro --------------------------------------------------------------------------

  /** Ajusta o tamanho interno do canvas. Devolve se mudou. */
  resize(width: number, height: number, px: number): boolean {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.px = px
    const w = Math.max(1, Math.round(this.width * px))
    const h = Math.max(1, Math.round(this.height * px))
    if (this.canvas.width === w && this.canvas.height === h) return false
    this.canvas.width = w
    this.canvas.height = h
    return true
  }

  /** Define a câmera do quadro. `center` é onde o alvo aparece, em fração do quadro. */
  camera(pose: Pose, center: readonly [number, number], fogRadius: number, near: number): void {
    const cp = Math.cos(pose.pitch)
    const eye: V3 = [
      pose.target[0] + pose.dist * Math.sin(pose.yaw) * cp,
      pose.target[1] + pose.dist * Math.sin(pose.pitch),
      pose.target[2] + pose.dist * Math.cos(pose.yaw) * cp,
    ]
    const forward = unit(sub(pose.target, eye))
    const right = unit(cross(forward, [0, 1, 0]))
    const up = cross(right, forward)
    this.eye = eye
    this.forward = forward
    this.right = right
    this.up = up
    this.view = [
      right[0], right[1], right[2], -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]),
      up[0], up[1], up[2], -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]),
      -forward[0], -forward[1], -forward[2], forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2],
    ]
    // o campo de visão é vertical; em tela em pé passa a valer a largura, para a cena caber de lado
    this.focal = Math.min(this.height, this.width * 1.1) / 2 / Math.tan(FOV / 2)
    this.cx = this.width * center[0]
    this.cy = this.height * center[1]
    this.proj[0] = (2 * this.focal) / this.width
    this.proj[1] = (2 * this.focal) / this.height
    this.proj[2] = (2 * this.cx) / this.width - 1
    this.proj[3] = 1 - (2 * this.cy) / this.height
    this.near = near
    this.fog[0] = Math.max(near, pose.dist - fogRadius)
    this.fog[1] = pose.dist + fogRadius
  }

  /** Onde um ponto da cena cai na tela (para rótulos e cotas em DOM). */
  project(p: V3, out: Projected): Projected {
    const v = apply(this.view, p)
    const depth = -v[2]
    out.depth = depth
    out.front = depth > this.near
    const d = out.front ? depth : this.near
    out.scale = this.focal / d
    out.x = this.cx + v[0] * out.scale
    out.y = this.cy - v[1] * out.scale
    return out
  }

  begin(time: number): void {
    const gl = this.gl
    this.time = time
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  private setBlend(mode: 'add' | 'over'): void {
    if (this.blend === mode) return
    this.blend = mode
    const gl = this.gl
    if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  /** view × model em coluna-maior, na área de trabalho. A conta é feita em precisão dupla. */
  private modelView(model: Mat | undefined): Float32Array {
    const m = model ? matMul(this.view, model) : this.view
    const o = this.m4
    o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[3] = 0
    o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[7] = 0
    o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[11] = 0
    o[12] = m[3]; o[13] = m[7]; o[14] = m[11]; o[15] = 1
    return o
  }

  private rgb(c: Tone | V3): V3 {
    return typeof c === 'string' ? this.palette[c] : c
  }

  stars(alpha = 1): void {
    const gl = this.gl
    const { p, u } = this.starProgram
    gl.useProgram(p)
    this.setBlend('add')
    const v = this.view
    const o = this.m3
    o[0] = v[0]; o[1] = v[4]; o[2] = v[8]
    o[3] = v[1]; o[4] = v[5]; o[5] = v[9]
    o[6] = v[2]; o[7] = v[6]; o[8] = v[10]
    gl.uniformMatrix3fv(u.uRot!, false, o)
    gl.uniform4fv(u.uProj!, this.proj)
    gl.uniform1f(u.uTime!, this.time)
    gl.uniform1f(u.uPx!, this.px)
    gl.uniform1f(u.uAlpha!, alpha)
    gl.bindVertexArray(this.starField.vao)
    gl.drawArrays(gl.POINTS, 0, this.starField.count)
  }

  planet(o: PlanetOpts): void {
    const gl = this.gl
    const { p, u } = this.planetProgram
    gl.useProgram(p)
    this.setBlend('over')
    const c = apply(this.view, o.center)
    gl.uniform4fv(u.uProj!, this.proj)
    gl.uniform3f(u.uC!, c[0], c[1], c[2])
    gl.uniform1f(u.uCC!, c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - o.radius * o.radius)
    gl.uniform1f(u.uR!, o.radius)
    gl.uniform1f(u.uAtm!, o.atmosphere)
    // normal em visão → mundo (transposta da rotação da câmera) → planeta (transposta da rotação dele)
    const v = this.view
    const r = o.rotation
    const m = this.m3
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        // linha i de Rpᵀ · Vᵀ, coluna j
        m[j * 3 + i] = r[i]! * v[j * 4]! + r[4 + i]! * v[j * 4 + 1]! + r[8 + i]! * v[j * 4 + 2]!
      }
    }
    gl.uniformMatrix3fv(u.uLocal!, false, m)
    const sun = turn(this.view, unit(o.sun))
    gl.uniform3f(u.uSun!, sun[0], sun[1], sun[2])
    gl.uniform2f(u.uGrid!, o.grid[0], o.grid[1])
    const ink = this.palette.cyan
    const landInk = this.palette.signal
    const air = this.palette.cool
    gl.uniform3f(u.uInk!, ink[0], ink[1], ink[2])
    gl.uniform3f(u.uLandInk!, landInk[0], landInk[1], landInk[2])
    gl.uniform3f(u.uAir!, air[0], air[1], air[2])
    gl.uniform1f(u.uAlpha!, o.alpha ?? 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.land)
    gl.uniform1i(u.uLand!, 0)
    gl.bindVertexArray(this.emptyVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  drawLines(batch: Lines, o: LineOpts = {}): void {
    if (!batch.count) return
    const gl = this.gl
    const { p, u } = this.lineProgram
    gl.useProgram(p)
    this.setBlend('add')
    gl.uniformMatrix4fv(u.uMV!, false, this.modelView(o.model))
    gl.uniform4fv(u.uProj!, this.proj)
    gl.uniform2f(u.uView!, this.canvas.width, this.canvas.height)
    gl.uniform1f(u.uPx!, this.px)
    gl.uniform1f(u.uNear!, this.near)
    gl.uniform1f(u.uReveal!, o.reveal ?? 1)
    gl.uniform3fv(u.uFog!, this.fog)
    gl.uniform2f(u.uFocus!, o.focus ? (this.tags.get(o.focus) ?? -1) : -1, o.focus ? (o.focusAmount ?? 1) : 0)
    gl.uniform1f(u.uAlpha!, o.alpha ?? 1)
    if (o.occluder) {
      const c = apply(this.view, o.occluder.center)
      gl.uniform4f(u.uOcc!, c[0], c[1], c[2], o.occluder.radius)
    } else gl.uniform4f(u.uOcc!, 0, 0, 0, 0)
    gl.bindVertexArray(batch.vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, batch.count)
  }

  drawFills(batch: Fills, o: LineOpts = {}): void {
    if (!batch.count) return
    const gl = this.gl
    const { p, u } = this.fillProgram
    gl.useProgram(p)
    this.setBlend('over')
    gl.uniformMatrix4fv(u.uMV!, false, this.modelView(o.model))
    gl.uniform4fv(u.uProj!, this.proj)
    gl.uniform1f(u.uNear!, this.near)
    gl.uniform1f(u.uReveal!, o.reveal ?? 1)
    gl.uniform3fv(u.uFog!, this.fog)
    gl.uniform2f(u.uFocus!, o.focus ? (this.tags.get(o.focus) ?? -1) : -1, o.focus ? (o.focusAmount ?? 1) : 0)
    gl.uniform1f(u.uAlpha!, o.alpha ?? 1)
    gl.bindVertexArray(batch.vao)
    gl.drawArrays(gl.TRIANGLES, 0, batch.count)
  }

  sprite(o: SpriteOpts): void {
    const gl = this.gl
    const { p, u } = this.spriteProgram
    gl.useProgram(p)
    this.setBlend(o.blend ?? 'add')
    const mv = o.model ? matMul(this.view, o.model) : this.view
    const c = apply(mv, o.at)
    if (-c[2] < this.near) return
    let ax: V3
    let ay: V3
    if (o.plane) {
      ax = turn(mv, o.plane[0])
      ay = turn(mv, o.plane[1])
    } else if (o.axis && o.stretch && o.stretch !== 1) {
      // elipsoide de revolução visto de lado: o semieixo aparente depende do ângulo com a visada
      const a = turn(mv, unit(o.axis))
      const l = Math.hypot(a[0], a[1])
      const dx = l > 1e-4 ? a[0] / l : 1
      const dy = l > 1e-4 ? a[1] / l : 0
      const major = o.radius * Math.sqrt(o.stretch * o.stretch * l * l + (1 - l * l))
      ax = [dx * major, dy * major, 0]
      ay = [-dy * o.radius, dx * o.radius, 0]
    } else {
      ax = [o.radius, 0, 0]
      ay = [0, o.radius, 0]
    }
    const c1 = this.rgb(o.color)
    const c2 = this.rgb(o.color2 ?? o.color)
    const q = o.p ?? [1, 1, 0, 0]
    gl.uniform3f(u.uCenter!, c[0], c[1], c[2])
    gl.uniform3f(u.uAx!, ax[0], ax[1], ax[2])
    gl.uniform3f(u.uAy!, ay[0], ay[1], ay[2])
    gl.uniform4fv(u.uProj!, this.proj)
    gl.uniform1f(u.uNear!, this.near)
    gl.uniform1i(u.uKind!, o.kind)
    gl.uniform3f(u.uColor!, c1[0], c1[1], c1[2])
    gl.uniform3f(u.uColor2!, c2[0], c2[1], c2[2])
    gl.uniform4f(u.uP!, q[0], q[1], q[2], q[3])
    gl.uniform1f(u.uAlpha!, o.alpha ?? 1)
    gl.uniform1f(u.uTime!, this.time)
    gl.uniform1f(u.uSeed!, o.seed ?? 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, o.data ?? this.blank)
    gl.uniform1i(u.uData!, 0)
    gl.bindVertexArray(this.spriteVao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  particles(o: ParticleOpts): void {
    const gl = this.gl
    const { p, u } = this.particleProgram
    gl.useProgram(p)
    this.setBlend('add')
    const c1 = this.rgb(o.color)
    const c2 = this.rgb(o.color2 ?? o.color)
    gl.uniformMatrix4fv(u.uMV!, false, this.modelView(o.model))
    gl.uniform4fv(u.uProj!, this.proj)
    gl.uniform1f(u.uNear!, this.near)
    gl.uniform1f(u.uTime!, this.time)
    gl.uniform1f(u.uPx!, this.px)
    gl.uniform1f(u.uSize!, o.size ?? 2.4)
    gl.uniform1i(u.uMode!, o.mode)
    gl.uniform4f(u.uP0!, o.p0[0], o.p0[1], o.p0[2], o.p0[3])
    gl.uniform4f(u.uP1!, o.p1[0], o.p1[1], o.p1[2], o.p1[3])
    gl.uniform3f(u.uColor!, c1[0], c1[1], c1[2])
    gl.uniform3f(u.uColor2!, c2[0], c2[1], c2[2])
    gl.uniform1f(u.uAlpha!, o.alpha ?? 1)
    gl.bindVertexArray(this.seeds.vao)
    gl.drawArrays(gl.POINTS, 0, Math.min(this.seeds.count, o.count ?? 600))
  }

  /** Matriz que deita o plano XY de uma peça de frente para a câmera (anéis de cota). */
  billboard(center: V3, scale: number): Mat {
    const r = this.right
    const u = this.up
    const f = this.forward
    return [r[0] * scale, u[0] * scale, -f[0] * scale, center[0], r[1] * scale, u[1] * scale, -f[1] * scale, center[1], r[2] * scale, u[2] * scale, -f[2] * scale, center[2]]
  }

  /** Libera o que este renderizador criou. O contexto fica: o mesmo canvas pode ser remontado. */
  dispose(): void {
    const gl = this.gl
    for (const program of [this.lineProgram, this.fillProgram, this.starProgram, this.planetProgram, this.spriteProgram, this.particleProgram]) gl.deleteProgram(program.p)
    this.free(this.starField)
    this.free(this.seeds)
    gl.deleteBuffer(this.corner)
    gl.deleteBuffer(this.spriteQuad)
    gl.deleteVertexArray(this.spriteVao)
    gl.deleteVertexArray(this.emptyVao)
    gl.deleteTexture(this.land)
    gl.deleteTexture(this.blank)
  }
}
