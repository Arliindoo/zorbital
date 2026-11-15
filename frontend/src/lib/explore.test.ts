import { describe, expect, it } from 'vitest'
import type { Row } from '@/api/types'
import { assignSlots, MAX_SERIES } from '@/charts/colors'
import { compare, summarize } from './explore'
import { flamesLong } from './flames'

const rows: Row[] = [
  { continent: 'Asia', year: 2000, lifeExp: 60 },
  { continent: 'Asia', year: 2000, lifeExp: 70 },
  { continent: 'Asia', year: 2005, lifeExp: 72 },
  { continent: 'Europe', year: 2000, lifeExp: 76 },
  { continent: 'Europe', year: 2005, lifeExp: 78 },
  { continent: 'Africa', year: 2000, lifeExp: 50 },
]

describe('compare', () => {
  it('agrega por entidade e por x, só as entidades escolhidas', () => {
    const table = compare(rows, { by: 'continent', entities: ['Asia', 'Europe'], x: 'year', measure: 'lifeExp', agg: 'média' })
    expect(new Set(table.map((r) => r.continent))).toEqual(new Set(['Asia', 'Europe']))
    expect(table).toHaveLength(4) // 2 anos × 2 continentes
    expect(table[0]).toEqual({ year: 2000, continent: 'Asia', lifeExp: 65 })
  })

  it('resume cada entidade na ordem de x', () => {
    const table = compare(rows, { by: 'continent', entities: ['Asia'], x: 'year', measure: 'lifeExp', agg: 'máximo' })
    const [asia] = summarize(table, { by: 'continent', x: 'year', measure: 'lifeExp' })
    expect(asia).toMatchObject({ points: 2, minimum: 70, maximum: 72, first: 70, last: 72 })
  })
})

describe('assignSlots', () => {
  it('a cor segue a entidade quando o filtro muda', () => {
    const slots = assignSlots(['Brazil', 'Chile', 'Peru'], {})
    const after = assignSlots(['Brazil', 'Peru', 'Cuba'], slots)
    expect(after.Brazil).toBe(slots.Brazil)
    expect(after.Peru).toBe(slots.Peru)
    expect(after.Cuba).toBe(slots.Chile) // herda a cor que ficou livre
  })

  it('recusa mais séries que cores', () => {
    expect(() => assignSlots(Array.from({ length: MAX_SERIES + 1 }, (_, i) => String(i)), {})).toThrow(RangeError)
  })
})

describe('flamesLong', () => {
  it('gera um ponto por ensaio e por chama, sem os vazios', () => {
    const tests = [
      { teste_id: 'a', pressao_atm: 1, dext_quente_mm: 3, dext_fria_mm: null },
      { teste_id: 'b', pressao_atm: 2, dext_quente_mm: 4, dext_fria_mm: 1 },
    ] as never[]
    const long = flamesLong(tests, ['teste_id', 'pressao_atm'])
    expect(long).toHaveLength(3)
    expect(long.filter((r) => r.tipo_chama === 'Chama fria')).toEqual([
      { teste_id: 'b', pressao_atm: 2, dext_mm: 1, tipo_chama: 'Chama fria' },
    ])
    expect(flamesLong(tests, ['teste_id'], { dropEmpty: false })).toHaveLength(4)
  })
})
