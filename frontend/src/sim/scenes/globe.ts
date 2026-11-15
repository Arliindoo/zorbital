/**
 * Cena 1 dos estudos em solo: a Terra inteira, com a órbita da ISS por fora.
 *
 * Serve para situar: estas investigações foram feitas em laboratório, sob gravidade normal — ao
 * contrário das de voo, lá em cima, a ~400 km. Unidade: quilômetro. A Terra e a órbita estão em
 * escala; o contorno dos continentes é estilizado.
 */

import { t } from '@/lib/i18n'
import type { Lines, Renderer } from '../engine/renderer'
import { dot, IDENTITY, sub, type V3 } from '../engine/vec'
import { Wire } from '../engine/wire'
import type { Hotspot, Scene } from '../types'

const R = 6371
const R_ORBIT = R + 408
const INCLINATION = (51.6 * Math.PI) / 180
const ORIGIN: V3 = [0, 0, 0]

const onGlobe = (latDeg: number, lonDeg: number, radius = R): V3 => {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  return [radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lon)]
}
const onOrbit = (angle: number): V3 => [R_ORBIT * Math.cos(angle), R_ORBIT * Math.sin(angle) * Math.sin(INCLINATION), R_ORBIT * Math.sin(angle) * Math.cos(INCLINATION)]

export interface GlobeOptions {
  next: string
  /** onde fica o laboratório, quando a fonte diz */
  site?: { lat: number; lon: number; name: string }
  /** rótulo do marcador de solo */
  label: string
  sub: string
}

export function globeScene<S>(r: Renderer, o: GlobeOptions): Scene<S> {
  const w = new Wire()
  for (let i = 0; i < 180; i++) if (i % 3 !== 2) w.seg(onOrbit((i / 180) * Math.PI * 2), onOrbit(((i + 1) / 180) * Math.PI * 2))
  const orbit: Lines = r.lines([w.mesh('signal', 0.8, { width: 1.2 })])
  const site: V3 = o.site ? onGlobe(o.site.lat, o.site.lon) : ORIGIN
  const mast = (() => {
    if (!o.site) return null
    w.seg(site, onGlobe(o.site.lat, o.site.lon, R + 520))
    w.ring(onGlobe(o.site.lat, o.site.lon, R + 6), site, 170, 28)
    w.ring(onGlobe(o.site.lat, o.site.lon, R + 6), site, 330, 36, { dash: true })
    return r.lines([w.mesh('magenta', 1, { width: 1.4 })])
  })()

  // a estação anda pela órbita; o rótulo dela some quando passa por trás do planeta
  const station: [number, number, number] = [R_ORBIT, 0, 0]
  const clear = (p: V3): boolean => {
    const eye = r.eye
    const d = sub(p, eye)
    const len2 = dot(d, d)
    const tca = -dot(eye, d) / len2 // ponto da reta mais perto do centro, em fração do caminho
    if (tca <= 0 || tca >= 1) return true
    const closest: V3 = [eye[0] + d[0] * tca, eye[1] + d[1] * tca, eye[2] + d[2] * tca]
    return dot(closest, closest) > R * R
  }
  const hotspots: Hotspot[] = [
    {
      id: 'solo',
      at: o.site ? onGlobe(o.site.lat, o.site.lon, R + 520) : ORIGIN,
      label: o.label,
      sub: o.sub,
      to: o.next,
      dx: -56,
      dy: 84,
      shown: () => !o.site || dot(site, sub(r.eye, site)) > 0,
    },
    { id: 'iss', at: station, label: 'ISS · ≈ 400 km', sub: t('microgravity: where FLEX, CFI and BASS-II flew', 'microgravidade: onde voaram FLEX, CFI e BASS-II'), dx: 40, dy: -40, minor: true, shown: () => clear(station) },
  ]
  // a câmera começa de frente para o laboratório (ou para o Atlântico, se a fonte não diz onde)
  const face = o.site ?? { lat: 20, lon: -40 }
  const yaw = (face.lon * Math.PI) / 180

  return {
    radius: 7200,
    near: 200,
    views: {
      main: { pose: { target: ORIGIN, yaw, pitch: 0.42, dist: 27500 }, zoom: [11000, 70000], center: [0.44, 0.47], idle: 'spin', hotspots },
    },
    draw(f) {
      r.stars(f.alpha)
      r.planet({ center: ORIGIN, radius: R, atmosphere: 0.035, rotation: IDENTITY, sun: [0.5, 0.35, 0.8], grid: [15, 2.5], alpha: f.alpha })
      const occluder = { center: ORIGIN, radius: R }
      r.drawLines(orbit, { reveal: f.reveal, alpha: f.alpha * 0.8, occluder })
      const angle = f.still ? 0.9 : f.now * 0.22
      const p = onOrbit(angle)
      station[0] = p[0]
      station[1] = p[1]
      station[2] = p[2]
      if (clear(station)) r.sprite({ at: station, radius: 420, kind: 0, color: 'signal', p: [1.6, 1.4, 0, 0], alpha: f.alpha * f.reveal })
      if (mast) {
        r.drawLines(mast, { reveal: f.reveal, alpha: f.alpha, occluder })
        if (dot(site, sub(r.eye, site)) > 0) r.sprite({ at: site, radius: 900, kind: 0, color: 'magenta', p: [2.2, 0.5 + 0.2 * Math.sin(f.now * 2.4), 0, 0], alpha: f.alpha * f.reveal })
      }
    },
    dispose() {
      r.free(orbit)
      r.free(mast)
    },
  }
}
