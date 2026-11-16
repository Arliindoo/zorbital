import { describe, expect, it } from 'vitest'
import { afterBurning, burnTime, d2, d2Curve, meanRate, plan, stateAt } from '@/visualization/replay/droplet'

describe('lei do d²', () => {
  it('passa pelos dois extremos', () => {
    expect(d2(4, 3, 0)).toBeCloseTo(4)
    expect(d2(4, 3, 1)).toBeCloseTo(3)
  })

  it('o quadrado do diâmetro cai em linha reta', () => {
    const mid = d2(4, 2, 0.5) ** 2
    expect(mid).toBeCloseTo((16 + 4) / 2)
  })

  it('tempo e diâmetro são inversos um do outro à mesma taxa', () => {
    const dEnd = afterBurning(4.039, 0.379, 5)
    expect(burnTime(4.039, dEnd, 0.379)).toBeCloseTo(5)
  })

  it('não devolve diâmetro negativo quando a gota acaba antes', () => {
    expect(afterBurning(2.57, 0.74, 10.4)).toBe(0)
  })
})

describe('plano de queima', () => {
  // ensaio 1206 do CFI: D0 4,039 → 3,577 mm em 11,92 (chama quente) → 0,497 mm (chama fria, K 0,385)
  const cool = burnTime(3.577, 0.497, 0.385)
  const p = plan(4.039, [
    { kind: 'hot', dEnd: 3.577, duration: 11.9167 },
    { kind: 'cool', dEnd: 0.497, duration: cool },
  ])

  it('encadeia os trechos pelo diâmetro', () => {
    expect(p.stages).toHaveLength(2)
    expect(p.stages[1]!.dStart).toBeCloseTo(3.577)
    expect(p.duration).toBeCloseTo(11.9167 + cool)
  })

  it('dá o diâmetro medido no fim de cada trecho', () => {
    expect(stateAt(p, 11.9167 - 1e-9).d).toBeCloseTo(3.577, 4)
    expect(stateAt(p, p.duration + 1).d).toBeCloseTo(0.497)
  })

  it('diz qual chama está acesa', () => {
    expect(stateAt(p, -1).flame).toBeNull()
    expect(stateAt(p, 5).flame).toBe('hot')
    expect(stateAt(p, 20).flame).toBe('cool')
    expect(stateAt(p, p.duration + 1).flame).toBeNull()
  })

  it('a taxa média do trecho frio é a K informada', () => {
    expect(meanRate(p.stages[1]!)).toBeCloseTo(0.385)
  })

  it('a curva (D/D0)² começa em 1 e desce', () => {
    const curve = d2Curve(p)
    expect(curve[0]).toEqual([0, 1])
    expect(curve[1]![1]).toBeCloseTo((3.577 / 4.039) ** 2)
    expect(curve[2]![1]).toBeLessThan(curve[1]![1])
  })

  it('ignora trechos sem duração e não deixa a gota crescer', () => {
    const q = plan(3, [
      { kind: 'hot', dEnd: 3.4, duration: 2 },
      { kind: 'cool', dEnd: 1, duration: 0 },
    ])
    expect(q.stages).toHaveLength(1)
    expect(q.stages[0]!.dEnd).toBe(3)
  })
})
