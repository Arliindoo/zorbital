import { describe, expect, it } from 'vitest'
import { locate, sample } from './model'

describe('leitura de uma série temporal', () => {
  const t = new Float32Array([0, 1, 2, 4])
  const v = new Float32Array([10, 20, 40, 80])

  it('localiza o instante como índice fracionário', () => {
    expect(locate(t, 0.5)).toBeCloseTo(0.5)
    expect(locate(t, 3)).toBeCloseTo(2.5)
  })

  it('não sai dos extremos', () => {
    expect(locate(t, -1)).toBe(0)
    expect(locate(t, 99)).toBe(3)
  })

  it('interpola o valor entre duas amostras', () => {
    expect(sample(v, locate(t, 0.5))).toBeCloseTo(15)
    expect(sample(v, locate(t, 3))).toBeCloseTo(60)
    expect(sample(v, locate(t, 4))).toBeCloseTo(80)
  })
})
