import { describe, expect, it } from 'vitest'
import type { Spec } from '@/api/types'
import { cleanSheet, cleanSpec, pendingColumns, sheetPending, sheetSize, specialValues } from './review'

const evidence = (trecho: string) => ({ arquivo: 'srd.txt', pagina: 1, trecho })

describe('ficha em revisão', () => {
  it('mantém a evidência, aplica as edições e deixa a linha nova sem evidência', () => {
    const cleaned = cleanSheet({
      condicoes: [
        { atributo: 'pressao', valor: '2 atm (câmara)', minimo: 2, evidencia: evidence('a'), conferido: false, confirmado: true },
        // linha nova, digitada na tela: o mínimo chega como texto
        { atributo: 'temperatura', valor: '300 K', minimo: '300' as unknown as number, confirmado: true },
      ],
    })

    expect(cleaned.condicoes!.map((c) => c.atributo)).toEqual(['pressao', 'temperatura'])
    expect(cleaned.condicoes![0]).toMatchObject({ valor: '2 atm (câmara)', evidencia: evidence('a'), confirmado: true })
    expect(cleaned.condicoes![1]).toMatchObject({ minimo: 300, maximo: null, evidencia: {} })
  })

  it('linha vazia não vira item, nem com as caixas marcadas', () => {
    const cleaned = cleanSheet({
      condicoes: [
        { atributo: 'agente_extintor', valor: 'N2', planejado: false, evidencia: evidence('b'), confirmado: true },
        { atributo: null, valor: '  ', planejado: true, confirmado: true },
      ],
      sensores: [{ nome: '', mede: null, grandeza: '', confirmado: true }],
    })

    expect(cleaned.condicoes).toHaveLength(1)
    expect(cleaned.condicoes![0]!.planejado).toBe(false)
    expect(cleaned.sensores).toEqual([])
  })

  it('objetivo sem texto sai; o que não foi marcado conta como desmarcado', () => {
    expect(cleanSheet({ objetivo: { texto: ' ', confirmado: true } }).objetivo).toBeNull()
    const sheet = cleanSheet({
      objetivo: { texto: 'Mapear limites.', evidencia: evidence('c') },
      sensores: [{ nome: 'Câmera UV', mede: 'OH*', evidencia: evidence('d'), confirmado: true }],
    })
    expect(sheetSize(sheet)).toBe(2)
    expect(sheetPending(sheet)).toBe(1)
  })
})

describe('especificação em revisão', () => {
  const spec: Spec = {
    investigacao: { id: 'PSI-26', nome: 'BASS', cautelas: [{ texto: 'Não é ranking.', evidencia: { tipo: 'documento' } }, { texto: 'Nova cautela' }, { texto: '   ' }] },
    tabelas: [
      {
        nome: 'testes',
        layout: 'simples',
        fontes: [{ arquivo: 't.csv', linha_cabecalho: 3.4, rotulo: '' }],
        colunas: [
          { origem: 'Date', natureza: 'IDENTIFICADOR', confirmado: true, unidade: '' },
          { origem: 'Fuel', natureza: 'CONDICAO', atributo: '', valores_especiais: [{ valor: -1, significado: 'sem leitura' }] },
          { origem: 'Notes', natureza: 'IGNORAR' },
        ],
      },
    ],
  }

  it('lista o que espera confirmação, sem as colunas ignoradas', () => {
    expect(pendingColumns(spec.tabelas[0]!)).toEqual(['Fuel'])
    expect(specialValues(spec.tabelas[0]!.colunas[1]!)).toBe('-1 → sem leitura')
  })

  it('normaliza o que vai para o servidor', () => {
    const cleaned = cleanSpec(spec)

    expect(cleaned.investigacao.cautelas).toEqual([
      { texto: 'Não é ranking.', evidencia: { tipo: 'documento' } },
      { texto: 'Nova cautela', evidencia: { tipo: 'inferido' } },
    ])
    expect(cleaned.tabelas[0]!.fontes[0]).toMatchObject({ linha_cabecalho: 3, rotulo: null })
    expect(cleaned.tabelas[0]!.colunas[1]).toMatchObject({ atributo: null, grandeza: null, confirmado: false })
    expect(cleaned.tabelas[0]!.colunas[0]!.unidade).toBeNull()
  })
})
