import { describe, expect, it } from 'vitest'
import { tc, td, translateResponse } from '@/shared/lib/i18n-data'

// os testes rodam sem navegador: o idioma é o padrão, inglês
describe('texto do banco em inglês', () => {
  it('troca valores de domínio só ao exibir', () => {
    expect(td('Extinção')).toBe('Extinction')
    expect(td('Chama fria')).toBe('Cool flame')
    const body = translateResponse({ rows: [{ desfecho: 'Extinção', status: 'Carregado' }] })
    expect(body.rows[0]).toEqual({ desfecho: 'Extinção', status: 'Carregado' })
  })

  it('troca frases e rótulos já na chegada', () => {
    const body = translateResponse({ categoria: 'Material sólido', detalhe: 'O2 caiu de 20.7% para 0.9%: revisar.', motivo: 'Coberto por FLEX.csv.' })
    expect(body).toEqual({ categoria: 'Solid material', detalhe: 'O2 went from 20.7% to 0.9%: review.', motivo: 'Covered by FLEX.csv.' })
  })

  it('traduz os textos que a carga monta a partir de rótulos', () => {
    expect(td('Pressão e oxigênio não variaram de forma independente: o efeito de uma não se separa do da outra nesses testes.')).toBe(
      'Pressure and oxygen did not vary independently: the effect of one cannot be separated from the other in these tests.',
    )
    expect(td('com oxigênio 0.12, só pressão ≈1.01 (8 testes); com geometria Seção esférica, só restritor de fluxo 2 (2 testes)')).toBe(
      'with oxygen 0.12, only pressure ≈1.01 (8 tests); with geometry Spherical section, only flow restrictor 2 (2 tests)',
    )
    expect(td('Extinção (32), Ruptura da gota (1), Queima completa (1)')).toBe('Extinction (32), Droplet disruption (1), Complete burn (1)')
    expect(td('Oxigênio: 0.12–0.3 fração molar')).toBe('Oxygen: 0.12–0.3 mole fraction')
  })

  it('troca nomes de coluna do banco e mantém os que não conhece', () => {
    expect(tc('teste_id')).toBe('test_id')
    expect(tc('diametro_inicial_mm')).toBe('initial_diameter_mm')
    expect(td('dext_fria_mm')).toBe('dext_cool_mm')
    expect(tc('coluna_de_um_envio')).toBe('coluna_de_um_envio')
  })

  it('deixa passar o que não conhece', () => {
    expect(td('Texto de um estudo enviado, sem tradução.')).toBe('Texto de um estudo enviado, sem tradução.')
    expect(td(null)).toBeNull()
  })
})
