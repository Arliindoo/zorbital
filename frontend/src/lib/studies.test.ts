import { describe, expect, it } from 'vitest'
import { clip, evidenceLabel, fold, overlaps, period, rangeText, searchStudies, studyPath } from './studies'

const cards = [
  { id: 'PSI-39', busca: [['nome', 'CFI — Cool Flames'], ['pergunta', 'Extinção da chama fria'], ['combustivel = n-dodecano', 'n-dodecano']] as [string, string][] },
  { id: 'PSI-25', busca: [['nome', 'BASS-II'], ['material = SIBAL', 'SIBAL (tecido)']] as [string, string][] },
]

describe('busca de estudos', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(fold('Extinção')).toBe('extincao')
    expect([...searchStudies(cards, 'EXTINCAO').keys()]).toEqual(['PSI-39'])
  })

  it('exige todas as palavras e diz onde achou cada uma', () => {
    expect(searchStudies(cards, 'chama dodecano').get('PSI-39')).toEqual(['pergunta', 'combustivel = n-dodecano'])
    expect(searchStudies(cards, 'chama sibal').size).toBe(0)
  })

  it('busca vazia mostra todos, sem motivo', () => {
    expect([...searchStudies(cards, '  ').values()]).toEqual([[], []])
  })
})

describe('filtros e rótulos', () => {
  it('uma faixa entra se cruza a escolhida; sem o dado, só com o filtro aberto', () => {
    expect(overlaps([1, 3], [3, 5])).toBe(true)
    expect(overlaps([1, 2], [3, 5])).toBe(false)
    expect(overlaps(null, null)).toBe(true)
    expect(overlaps(null, [0, 1])).toBe(false)
  })

  it('estudos do catálogo abrem na página própria e os enviados na genérica', () => {
    expect(studyPath('PSI-69')).toBe('/flex')
    expect(studyPath('PSI-26')).toBe('/estudos/PSI-26')
  })

  it('escreve de onde saiu a interpretação', () => {
    expect(evidenceLabel({ tipo: 'documento', arquivo: 'srd.pdf', pagina: 4, trecho: 'quiescent air' })).toBe('documento · srd.pdf p. 4 · “quiescent air”')
    expect(evidenceLabel({ tipo: 'cabecalho' })).toBe('cabeçalho da tabela')
    expect(evidenceLabel(null)).toBe('inferido pela IA')
  })

  it('resume período, faixa e pergunta longa', () => {
    expect(period({ inicio: '08-01-2007', fim: '07-31-2016' })).toBe('2007–2016')
    expect(period({ inicio: '08-01-2007', fim: '12-31-2007' })).toBe('2007')
    expect(period({ inicio: null, fim: null })).toBeNull()
    expect(rangeText([0.12, 0.3], 100)).toBe('12–30')
    expect(rangeText([1, 1])).toBe('1')
    expect(clip('uma pergunta bem curta')).toBe('uma pergunta bem curta')
    expect(clip('palavra '.repeat(40)).endsWith('…')).toBe(true)
    expect(clip('palavra '.repeat(40)).length).toBeLessThanOrEqual(160)
  })
})
