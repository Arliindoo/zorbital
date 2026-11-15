/**
 * Shaders da simulação (WebGL2 / GLSL ES 3.00).
 *
 * Convenções: espaço de visão com a câmera na origem olhando para −Z; a projeção é
 * `ndc = uProj.xy * p.xy / -p.z + uProj.zw` (foco e centro óptico em NDC). Cores saem
 * pré-multiplicadas. Não há buffer de profundidade: o desenho é em linhas, "raio X".
 */

/** Segmentos como quadriláteros instanciados: espessura em pixels e borda suavizada no shader. */
export const LINE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aA;
layout(location = 2) in vec3 aB;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec3 aMeta; // ordem de entrada (0..1), id do grupo, espessura (px CSS)
uniform mat4 uMV;
uniform vec4 uProj;
uniform vec2 uView;   // tamanho do quadro em px do dispositivo
uniform float uPx;    // px do dispositivo por px de CSS
uniform float uNear;
uniform float uReveal;
uniform vec3 uFog;    // início, fim, fator mínimo
uniform vec2 uFocus;  // id do grupo em realce, intensidade
uniform float uAlpha;
uniform vec4 uOcc;    // esfera que encobre (centro em visão, raio); raio 0 = nenhuma
out vec4 vColor;
out vec2 vEdge;

vec2 toPx(vec3 p) {
  return (uProj.xy * p.xy / -p.z + uProj.zw) * 0.5 * uView + 0.5 * uView;
}

float hidden(vec3 p) {
  if (uOcc.w <= 0.0) return 0.0;
  float dist = length(p);
  float tca = dot(uOcc.xyz, p / dist);
  if (tca <= 0.0) return 0.0;
  float d2 = dot(uOcc.xyz, uOcc.xyz) - tca * tca;
  float r2 = uOcc.w * uOcc.w;
  if (d2 >= r2) return 0.0;
  return (tca - sqrt(r2 - d2)) < dist ? 1.0 : 0.0;
}

void main() {
  vec3 a = (uMV * vec4(aA, 1.0)).xyz;
  vec3 b = (uMV * vec4(aB, 1.0)).xyz;
  // entrada: cada segmento cresce a partir de A, em ordem
  float grow = clamp(uReveal * 1.7 - aMeta.x * 0.7, 0.0, 1.0);
  b = mix(a, b, grow);
  float da = -a.z - uNear;
  float db = -b.z - uNear;
  if ((da < 0.0 && db < 0.0) || grow <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0);
    vEdge = vec2(0.0);
    return;
  }
  // recorte no plano próximo, feito aqui porque a expansão é em pixels
  if (da < 0.0) a = mix(a, b, da / (da - db));
  else if (db < 0.0) b = mix(b, a, db / (db - da));
  vec2 pa = toPx(a);
  vec2 pb = toPx(b);
  vec2 dir = pb - pa;
  float span = length(dir);
  dir = span > 1e-4 ? dir / span : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = aMeta.z * uPx * 0.5;
  float ext = hw + 1.0;
  vec2 p = mix(pa, pb, aCorner.x) + nrm * aCorner.y * ext + dir * (aCorner.x * 2.0 - 1.0) * 0.5;
  gl_Position = vec4(p / uView * 2.0 - 1.0, 0.0, 1.0);
  vec3 q = mix(a, b, aCorner.x);
  float fog = mix(1.0, uFog.z, clamp((-q.z - uFog.x) / max(uFog.y - uFog.x, 1e-6), 0.0, 1.0));
  float focus = 1.0;
  if (uFocus.y > 0.0) focus = abs(aMeta.y - uFocus.x) < 0.5 ? 1.0 + 0.9 * uFocus.y : 1.0 - 0.55 * uFocus.y;
  vColor = vec4(aColor.rgb, aColor.a * fog * focus * uAlpha * (1.0 - hidden(q)));
  vEdge = vec2(aCorner.y * ext, hw);
}`

export const LINE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vEdge;
out vec4 o;
void main() {
  float aa = 1.0 - smoothstep(vEdge.y - 0.5, vEdge.y + 0.5, abs(vEdge.x));
  float a = min(vColor.a, 1.6) * aa;
  o = vec4(vColor.rgb * a, a);
}`

/** Painéis translúcidos (painéis solares, faces de racks): triângulos de cor chapada. */
export const FILL_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
layout(location = 2) in vec2 aMeta; // ordem de entrada, id do grupo
uniform mat4 uMV;
uniform vec4 uProj;
uniform float uNear;
uniform float uReveal;
uniform vec3 uFog;
uniform vec2 uFocus;
uniform float uAlpha;
out vec4 vColor;
void main() {
  vec3 p = (uMV * vec4(aPos, 1.0)).xyz;
  float w = -p.z;
  gl_Position = vec4(uProj.x * p.x + uProj.z * w, uProj.y * p.y + uProj.w * w, w - 2.0 * uNear, w);
  float fog = mix(1.0, uFog.z, clamp((w - uFog.x) / max(uFog.y - uFog.x, 1e-6), 0.0, 1.0));
  float grow = clamp(uReveal * 1.7 - aMeta.x * 0.7 - 0.25, 0.0, 1.0);
  float focus = 1.0;
  if (uFocus.y > 0.0) focus = abs(aMeta.y - uFocus.x) < 0.5 ? 1.0 + 1.2 * uFocus.y : 1.0 - 0.4 * uFocus.y;
  vColor = vec4(aColor.rgb, aColor.a * fog * grow * focus * uAlpha);
}`

export const FILL_FS = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 o;
void main() {
  o = vec4(vColor.rgb * vColor.a, vColor.a);
}`

/** Estrelas: direções na esfera celeste; só a rotação da câmera as move (paralaxe de infinito). */
export const STAR_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aDir;
layout(location = 1) in vec4 aStar;  // tamanho (px CSS), fase, brilho, ritmo da cintilação
layout(location = 2) in vec3 aTint;
uniform mat3 uRot;
uniform vec4 uProj;
uniform float uTime;
uniform float uPx;
uniform float uAlpha;
out vec4 vColor;
void main() {
  vec3 d = uRot * aDir;
  if (d.z > -0.04) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec4(0.0);
    return;
  }
  gl_Position = vec4(uProj.xy * d.xy / -d.z + uProj.zw, 0.0, 1.0);
  gl_PointSize = aStar.x * uPx;
  float twinkle = 0.7 + 0.3 * sin(uTime * aStar.w + aStar.y);
  vColor = vec4(aTint, aStar.z * twinkle * uAlpha);
}`

export const STAR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 o;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.25, 1.0, d)) * vColor.a;
  o = vec4(vColor.rgb * a, a);
}`

/**
 * Planeta por traçado de raio num triângulo de tela cheia: esfera exata em perspectiva, sem malha.
 * Grade de paralelos/meridianos e continentes em pontos são gerados no fragmento; a atmosfera é o
 * brilho de borda (dentro) e um halo exponencial (fora).
 */
export const PLANET_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 0.0, 1.0);
}`

export const PLANET_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec4 uProj;
uniform vec3 uC;       // centro, em visão
uniform float uCC;     // |C|² − R², calculado em precisão dupla na CPU
uniform float uR;
uniform float uAtm;    // espessura visual da atmosfera, nas unidades da cena
uniform mat3 uLocal;   // normal em visão → coordenadas do planeta (Y = polo norte)
uniform sampler2D uLand;
uniform vec3 uSun;     // direção do Sol, em visão
uniform vec2 uGrid;    // passo da grade e dos pontos, em graus
uniform vec3 uInk;     // cor da grade
uniform vec3 uLandInk; // cor dos continentes
uniform vec3 uAir;     // cor da atmosfera
uniform float uAlpha;
out vec4 o;
const float PI = 3.14159265358979;
void main() {
  vec3 d = normalize(vec3((vNdc - uProj.zw) / uProj.xy, -1.0));
  float b = dot(d, uC);
  float disc = b * b - uCC;
  float ahead = step(0.0, b);
  float hit = step(0.0, disc) * ahead;
  float t = b - sqrt(max(disc, 0.0));
  vec3 n = normalize(d * t - uC);
  float ndv = clamp(dot(n, -d), 0.0, 1.0);
  vec3 pl = uLocal * n;
  float lat = degrees(asin(clamp(pl.y, -1.0, 1.0)));
  float lon = degrees(atan(pl.x, pl.z));
  float sun = clamp(dot(n, uSun) * 0.6 + 0.45, 0.0, 1.0);

  // grade: linha onde a coordenada cruza um múltiplo do passo, com largura de ~1 px
  vec2 g = vec2(lon, lat) / uGrid.x;
  vec2 gw = max(fwidth(g), vec2(1e-5));
  vec2 gd = abs(fract(g - 0.5) - 0.5) / gw;
  float line = (1.0 - min(min(gd.x, gd.y), 1.0)) * clamp(1.0 - max(gw.x, gw.y) * 2.5, 0.0, 1.0);

  // continentes: um ponto por célula, aceso onde a máscara diz "terra"
  vec2 q = vec2(lon, lat) / uGrid.y;
  float qw = max(fwidth(q.x), fwidth(q.y));
  vec2 cell = floor(q) + 0.5;
  vec2 uv = vec2(cell.x * uGrid.y / 360.0 + 0.5, 0.5 - cell.y * uGrid.y / 180.0);
  float land = smoothstep(0.42, 0.58, textureLod(uLand, uv, 0.0).r);
  float dotMask = (1.0 - smoothstep(0.2, 0.2 + qw * 1.5, length(fract(q) - 0.5))) * clamp(1.0 - qw * 1.6, 0.0, 1.0);

  vec3 ocean = mix(vec3(0.004, 0.009, 0.02), vec3(0.012, 0.04, 0.075), sun);
  float rim = pow(1.0 - ndv, 3.2);
  vec3 surface = ocean
    + uInk * line * 0.34 * (0.35 + 0.65 * sun)
    + uLandInk * dotMask * land * (0.22 + 0.7 * sun)
    + uLandInk * land * 0.035 * sun
    + uAir * rim * (0.35 + 0.75 * sun);

  // halo: altura do ponto mais próximo do raio à superfície = −disc / (2R), sem cancelamento
  float h = -disc / (2.0 * uR * uAtm);
  float halo = exp(-max(h, 0.0) * 3.4) * (1.0 - hit) * ahead * 0.55;

  vec3 col = surface * hit + uAir * halo;
  float alpha = hit + halo * 0.6;
  o = vec4(col * uAlpha, clamp(alpha, 0.0, 1.0) * uAlpha);
}`

/**
 * Sprites: um quadrilátero no espaço de visão (centro + dois semieixos) e um fragmento por tipo.
 * 0 brilho suave · 1 casca esférica emissiva (chama) · 2 gota líquida · 3 disco de chama ·
 * 4 folha de luz (laser) · 5 faixa pintada por um perfil 1D (textura de dados)
 */
export const SPRITE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner; // −1..1
uniform vec3 uCenter;
uniform vec3 uAx;
uniform vec3 uAy;
uniform vec4 uProj;
uniform float uNear;
out vec2 vUV;
void main() {
  vUV = aCorner;
  vec3 p = uCenter + uAx * aCorner.x + uAy * aCorner.y;
  float w = -p.z;
  gl_Position = vec4(uProj.x * p.x + uProj.z * w, uProj.y * p.y + uProj.w * w, w - 2.0 * uNear, w);
}`

export const SPRITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
uniform int uKind;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec4 uP;
uniform float uAlpha;
uniform float uTime;
uniform float uSeed;
uniform sampler2D uData;
out vec4 o;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  float r = length(vUV);
  float ang = atan(vUV.y, vUV.x);
  vec3 col = uColor;
  float a = 0.0;
  if (uKind == 0) {
    // uP: expoente, ganho
    a = pow(max(1.0 - r, 0.0), uP.x) * uP.y;
  } else if (uKind == 1) {
    // casca fina emissiva vista por transparência: integra a emissão ao longo da corda do raio,
    // o que dá o bordo mais claro de uma chama esférica. uP: raio da casca, espessura, tremor, miolo
    float wob = (noise(vec2(ang * 2.4 + uSeed, uTime * 1.6)) - 0.5) * uP.z;
    float r0 = uP.x * (1.0 + wob);
    float zmax = sqrt(max(1.0 - r * r, 0.0));
    float acc = 0.0;
    for (int i = 0; i < 12; i++) {
      float z = (float(i) + 0.5) / 12.0 * zmax;
      float dd = (sqrt(r * r + z * z) - r0) / uP.y;
      acc += exp(-dd * dd);
    }
    float shell = acc * zmax / 12.0 / (uP.y * 1.9);
    float core = exp(-r * r / (r0 * r0) * 2.4) * uP.w;
    a = (shell * 0.62 + core) * smoothstep(1.0, 0.8, r);
    col = mix(uColor2, uColor, clamp(shell * 0.8, 0.0, 1.0));
    col = mix(col, vec3(1.0, 0.97, 0.9), clamp(shell - 0.85, 0.0, 0.55));
  } else if (uKind == 2) {
    // gota: corpo quase transparente, borda de Fresnel e um reflexo. uP.x: quanto de uColor2 na borda
    float fw = fwidth(r) * 1.5;
    float inside = 1.0 - smoothstep(1.0 - fw, 1.0, r);
    float nz = sqrt(max(1.0 - r * r, 0.0));
    float fres = pow(1.0 - nz, 2.2);
    float spec = pow(max(dot(normalize(vec3(vUV, nz)), normalize(vec3(-0.45, 0.55, 0.7))), 0.0), 30.0);
    col = uColor * (0.12 + fres * 0.9) + uColor2 * fres * uP.x + vec3(spec * 0.85);
    a = inside * (0.2 + fres * 0.8 + spec * 0.6);
    o = vec4(col * inside * uAlpha, a * uAlpha);
    return;
  } else if (uKind == 3) {
    // disco de chama no plano de estagnação. uP: início do esmaecimento, raio do anel, ganho, tremor
    float n = noise(vec2(ang * 3.0 + uSeed, uTime * 2.1));
    float body = smoothstep(1.0, uP.x, r);
    float ringGlow = exp(-pow((r - uP.y) / 0.07, 2.0));
    a = (body * (0.6 + uP.w * (n - 0.5)) + ringGlow * 0.3) * uP.z;
    col = mix(uColor2, uColor, body);
  } else if (uKind == 4) {
    // folha de luz. uP: ganho, posição da linha de varredura (−1..1), ganho da linha
    float edge = 1.0 - smoothstep(0.75, 1.0, abs(vUV.y));
    float along = 1.0 - smoothstep(0.6, 1.0, abs(vUV.x));
    float scan = exp(-pow((vUV.y - uP.y) / 0.03, 2.0)) * uP.z;
    a = edge * along * uP.x + scan * along;
  } else {
    // faixa pintada pelo perfil medido ao longo de y. uP: estreitamento lateral, ganho, cursor, piso
    float v = vUV.y * 0.5 + 0.5;
    float s = textureLod(uData, vec2(v, 0.5), 0.0).r;
    float lateral = exp(-vUV.x * vUV.x * uP.x);
    float cursor = exp(-pow((vUV.y - uP.z) / 0.02, 2.0)) * 0.55 * (1.0 - smoothstep(0.8, 1.0, abs(vUV.x)));
    a = (s * uP.y + uP.w) * lateral + cursor;
    col = mix(uColor2, uColor, s);
  }
  a *= uAlpha;
  o = vec4(col * a, a);
}`

/**
 * Partículas sem estado: a posição de cada uma é função da semente e do tempo, calculada no
 * vértice. Não há simulação na CPU nem reenvio de buffer por quadro.
 * 0 saída radial (vapor da gota) · 1 escoamento num duto, contornando um corpo ·
 * 2 contrafluxo axissimétrico (escoamento potencial: r = r0·e^(aτ/2), y = y0·e^(−aτ))
 */
export const PARTICLE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec4 aSeed;
uniform mat4 uMV;
uniform vec4 uProj;
uniform float uNear;
uniform float uTime;
uniform float uPx;
uniform float uSize;
uniform int uMode;
uniform vec4 uP0;
uniform vec4 uP1;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uAlpha;
out vec4 vColor;
const float TAU = 6.28318530718;
void main() {
  vec3 pos = vec3(0.0);
  float fade = 0.0;
  vec3 tint = uColor;
  if (uMode == 0) {
    // uP0: raio inicial, raio final · uP1.x: ciclos por segundo
    float cz = 1.0 - 2.0 * aSeed.x;
    float sz = sqrt(max(1.0 - cz * cz, 0.0));
    float ph = aSeed.y * TAU;
    float life = fract(aSeed.z + uTime * uP1.x * (0.5 + aSeed.w));
    pos = vec3(sz * cos(ph), cz, sz * sin(ph)) * mix(uP0.x, uP0.y, life);
    fade = sin(3.14159265 * life);
  } else if (uMode == 1) {
    // uP0.xyz: meias-medidas do duto · uP1: ciclos/s, raio do corpo
    vec2 xz = (aSeed.xy * 2.0 - 1.0) * uP0.xz;
    float life = fract(aSeed.z + uTime * uP1.x * (0.6 + 0.8 * aSeed.w));
    float y = (life * 2.0 - 1.0) * uP0.y;
    float rho2 = dot(xz, xz) + 1e-5;
    float rb = uP1.y;
    float near = exp(-pow(y / (rb * 2.4 + 1e-4), 2.0));
    xz *= 1.0 + near * rb * rb / (rho2 + rb * rb * 0.5);
    pos = vec3(xz.x, y, xz.y);
    fade = sin(3.14159265 * life);
  } else {
    // uP0: meia distância entre bocais, raio do bocal, raio máximo, a·T · uP1.x: ciclos/s
    float side = aSeed.w < 0.5 ? 1.0 : -1.0;
    float r0 = sqrt(aSeed.x) * uP0.y;
    float th = aSeed.y * TAU;
    float life = fract(aSeed.z + uTime * uP1.x * (0.7 + 0.6 * fract(aSeed.w * 7.13)));
    float tau = life * uP0.w;
    float rr = r0 * exp(tau * 0.5);
    pos = vec3(cos(th) * rr, side * uP0.x * exp(-tau), sin(th) * rr);
    fade = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(uP0.z * 0.7, uP0.z, rr));
    tint = side > 0.0 ? uColor2 : uColor;
  }
  vec3 p = (uMV * vec4(pos, 1.0)).xyz;
  float w = -p.z;
  if (w < uNear) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec4(0.0);
    return;
  }
  gl_Position = vec4(uProj.xy * p.xy / w + uProj.zw, 0.0, 1.0);
  gl_PointSize = uSize * uPx;
  vColor = vec4(tint, fade * uAlpha);
}`

export const PARTICLE_FS = STAR_FS
