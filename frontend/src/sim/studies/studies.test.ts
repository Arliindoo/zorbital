import { describe, expect, it } from 'vitest'
import type { AlertRow, BassRow, CfiRow, FlexRow, Psi117Comparison, Psi142Point, Psi142Set } from '@/api/types'
import { fixed } from '@/lib/format'
import { bassStudy } from './bass'
import { cfiStudy } from './cfi'
import { flexStudy } from './flex'
import { psi117Study } from './psi117'
import { psi142Study } from './psi142'

const flex = (over: Partial<FlexRow>): FlexRow => ({
  teste_id: '1',
  identificador: '20CAL08',
  combustivel: 'Methanol',
  desfecho: 'Extinção',
  pressao_mmhg: 760,
  oxigenio_fracao: 0.21,
  nitrogenio_fracao: 0.79,
  helio_fracao: 0,
  gas_co_rotulo_ambiguo_fracao: 0,
  diametro_inicial_mm: 3,
  diametro_extincao_visivel_mm: 1.5,
  taxa_queima_valor: 0.5,
  tempo_queima_s: 10,
  data: '2009-03-05',
  ...over,
})

describe('FLEX', () => {
  it('reproduz do diâmetro inicial ao de extinção, no tempo de queima da fonte', () => {
    const [run] = flexStudy([flex({})]).runs
    expect(run!.playable).toBe(true)
    expect(run!.duration).toBe(10)
    expect(run!.state.plan.stages[0]).toMatchObject({ dStart: 3, dEnd: 1.5, estimated: false })
  })

  it('sem o diâmetro de extinção, estima pela lei do d² e marca como estimado', () => {
    const [run] = flexStudy([flex({ diametro_extincao_visivel_mm: null })]).runs
    const stage = run!.state.plan.stages[0]!
    expect(stage.estimated).toBe(true)
    expect(stage.dEnd).toBeCloseTo(Math.sqrt(9 - 0.5 * 10))
    expect(run!.notes.some((n) => n.includes('estimated'))).toBe(true)
  })

  it('sem o diâmetro inicial não inventa nada: o ensaio fica sem reconstrução', () => {
    const [run] = flexStudy([flex({ diametro_inicial_mm: null })]).runs
    expect(run!.playable).toBe(false)
    expect(run!.blocked).toBeTruthy()
  })

  it('queima completa leva a gota a zero', () => {
    const [run] = flexStudy([flex({ desfecho: 'Queima completa', diametro_extincao_visivel_mm: null })]).runs
    expect(run!.state.plan.stages[0]!.dEnd).toBe(0)
    expect(run!.state.ending).toBe('completa')
  })
})

const cfi = (over: Partial<CfiRow>): CfiRow => ({
  teste_id: '1206',
  combustivel: 'n-dodecano',
  diluente: 'Nitrogênio',
  pressao_atm: 1,
  oxigenio_fracao: 0.21,
  nitrogenio_fracao: 0.79,
  helio_fracao: 0,
  d0_mm: 4.039,
  dext_quente_mm: 3.577,
  dext_fria_mm: 0.497,
  k_quente_mm2_s: 0.379,
  k_fria_mm2_s: 0.385,
  tempo_chama_quente: 11.9167,
  dext_fria_zero_na_fonte: false,
  dext_fria_extrapolado: false,
  analise_completa: true,
  fibra: false,
  rad_pico_chama_quente: 21.8,
  ...over,
})

describe('CFI', () => {
  it('encadeia chama quente e chama fria; a fria dura o que a K dela leva entre os dois diâmetros', () => {
    const [run] = cfiStudy([cfi({})], []).runs
    const [hot, cool] = run!.state.plan.stages
    expect(hot).toMatchObject({ kind: 'hot', dStart: 4.039, dEnd: 3.577 })
    expect(cool!.kind).toBe('cool')
    expect(cool!.t1 - cool!.t0).toBeCloseTo((3.577 ** 2 - 0.497 ** 2) / 0.385)
    expect(run!.verdict.label).toBe('Cool flame extinction')
  })

  it('0 na fonte é gota consumida, não diâmetro de 0 mm medido', () => {
    const [run] = cfiStudy([cfi({ dext_fria_mm: null, dext_fria_zero_na_fonte: true })], []).runs
    expect(run!.state.ending).toBe('consumida')
    expect(run!.verdict.detail).toContain('is not a diameter')
  })

  it('K da chama fria sem diâmetro de extinção vira um trecho em aberto', () => {
    const [run] = cfiStudy([cfi({ dext_fria_mm: null })], []).runs
    expect(run!.state.plan.stages[1]!.open).toBe(true)
    expect(run!.phases.at(-1)!.open).toBe(true)
  })

  it('acende no rack só as câmeras que a tabela marca como ligadas', () => {
    const study = cfiStudy([cfi({})], [{ teste_id: '1206', HIBMS: 'yes', LLL: 'no', 'HIBMS-2': 'yes', 'IPSU-4': 'no' }])
    expect(study.stages.map((s) => s.id)).toEqual(['orbita', 'laboratorio', 'camara'])
  })
})

describe('BASS-II', () => {
  const row: BassRow = {
    teste_id: 'B3',
    pesquisador: 'Bhattacharjee',
    material_original: '100 micron film, 2 cm wide',
    material_categoria: 'Não escrito na fonte',
    geometria: 'Filme',
    o2_inicial_pct: 22.2,
    o2_final_pct: 21.8,
    delta_co2_pp: 0.06,
    co2_inicial_pct: 0.43,
    co2_final_pct: 0.49,
    co_inicial_ppm: 12,
    co_final_ppm: 19,
    largura_cm: 2,
    espessura_mm: 0.1,
    diametro_mm: null,
  }
  it('leva as medidas da amostra para a cena e interpola os gases só entre as duas leituras', () => {
    const [run] = bassStudy([row]).runs
    expect(run!.state).toMatchObject({ shape: 'Filme', width: 20, thickness: 0.1 })
    const [o2Start] = run!.telemetry(0)
    const [o2Mid] = run!.telemetry(50)
    expect(o2Start).toMatchObject({ value: fixed(22.2, 1), soft: false })
    expect(o2Mid).toMatchObject({ value: fixed(22, 1), soft: true })
  })
})

describe('PSI-117', () => {
  const rows: Psi117Comparison[] = [
    { tipo_chama: 'Chama fria', pressao_atm: 0.75, medido_mm: 0.49, n_medicoes: 1, modelo_mm: 0.41, limite_inferior_mm: 0.23, limite_superior_mm: 0.81, diferenca_mm: -0.08, modelo_na_faixa: true },
    { tipo_chama: 'Chama quente', pressao_atm: 3, medido_mm: 3.56, n_medicoes: 1, modelo_mm: 3.94, limite_inferior_mm: null, limite_superior_mm: null, diferenca_mm: 0.38, modelo_na_faixa: null },
  ]
  it('diz se o modelo cai na faixa, e não julga quando não há faixa', () => {
    const [cool, hot] = psi117Study(rows, null, null).runs
    expect(cool!.verdict.label).toBe('Model within the range')
    expect(hot!.verdict.label).toBe('No uncertainty range')
    expect(hot!.level).toBeCloseTo(1)
  })
})

describe('PSI-142', () => {
  const set: Psi142Set = { conjunto_id: 5, publicacao: null, figura: '8', descricao_planilha: 'CH2O PLIF and thermometry', descricao_csv: null, doi: null }
  const point = (x: number, y: number, over: Partial<Psi142Point> = {}): Psi142Point => ({ conjunto_id: 5, serie: 'O3 = 0.0 mol.%', x_nome: 'distance [cm]', x_unidade: 'cm', y_nome: 'PLIF signal [a.u.]', y_unidade: 'a.u.', x, y, ...over })

  it('um perfil espacial vira uma varredura, com o disco no máximo do sinal', () => {
    const { runs } = psi142Study(set, [point(0, 10), point(1, 300), point(2, 20)], [])
    expect(runs).toHaveLength(1)
    expect(runs[0]!.state).toMatchObject({ kind: 'perfil', instrument: 'plif' })
    expect(runs[0]!.state.peak).toBeCloseTo(0.5, 1)
    expect(runs[0]!.start).toBe(0)
    expect(runs[0]!.duration).toBe(2)
  })

  it('uma curva de limite percorre a fração de combustível e interpola o estiramento', () => {
    const limit = { x_nome: 'Yf', x_unidade: null, y_nome: 'aCFE (1/s)', y_unidade: '1/s', serie: 'nC12' }
    const { runs } = psi142Study({ ...set, conjunto_id: 1 }, [point(0.05, 40, limit), point(0.15, 120, limit)], [])
    expect(runs[0]!.state.kind).toBe('limite')
    expect(runs[0]!.telemetry(0.1)[0]).toMatchObject({ value: '80', soft: true })
  })

  it('série com eixo suspeito na fonte fica marcada', () => {
    const alert: AlertRow = { investigacao: 'PSI-142', teste_id: 'conjunto 5 · O3 = 0.0 mol.%', campo: 'x', valor_original: null, tipo: 'eixo_suspeito', detalhe: 'A distância vai longe demais.' }
    const { runs } = psi142Study(set, [point(0, 10), point(1, 300)], [alert])
    expect(runs[0]!.toneLabel).toBe('Suspect axis in the source')
  })
})
