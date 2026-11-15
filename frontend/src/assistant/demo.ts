import { t } from '@/lib/i18n'
import type { ApiMessage, ChatEvent, PageKey, Screen, Study } from './types'

/**
 * Fluxo simulado, só em desenvolvimento: `?agentDemo=1` na URL troca a chamada real por eventos encenados
 * (não gasta créditos). Variantes: `?agentDemo=erro`, `?agentDemo=direto` (sem consultas), `?agentDemo=lento`
 * e `?agentDemo=jato` (consultas e resposta chegam de uma vez, como faz o provedor real).
 * Uma pergunta com a palavra "erro", "direto" ou "jato" força a variante sem recarregar.
 */
export type DemoMode = 'normal' | 'erro' | 'direto' | 'lento' | 'jato'

function readMode(): DemoMode | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const flag = new URLSearchParams(window.location.search).get('agentDemo')
  if (flag === null || flag === '0') return null
  return flag === 'erro' || flag === 'direto' || flag === 'lento' || flag === 'jato' ? flag : 'normal'
}

/** Lido uma vez: a navegação entre páginas perde a query, mas o modo continua até recarregar. */
export const DEMO_MODE: DemoMode | null = readMode()

const TOOLS: Record<PageKey, string[]> = {
  overview: ['listar_investigacoes()', 'inventario_arquivos(investigacao=PSI-69)', 'cautelas(investigacao=PSI-69)'],
  flex: ['tela_resumo()', 'flex_agrupar(por=desfecho, medida=pressao_mmhg)', 'alertas(conjunto=flex_ensaios)'],
  bass: ['tela_resumo()', 'bass_agrupar(por=material)', 'alertas(conjunto=bass_testes)'],
  psi117: ['tela_estatisticas(coluna=dext_fria)', 'psi117_comparar(pressao_atm=1)', 'cautelas(investigacao=PSI-117)'],
  cfi: ['tela_resumo()', 'cfi_agrupar(por=pressao_atm, medida=dext_fria)', 'dicionario(termo=Dext fria)'],
  psi142: ['psi142_conjuntos()', 'psi142_serie(conjunto=1)', 'alertas(conjunto=psi142)'],
  comparacao: ['tela_resumo()', 'psi117_extincao_1atm()', 'cfi_agrupar(por=pressao_atm)'],
  estudos: ['tela_resumo()', 'cautelas()', 'dicionario(termo=natureza)'],
  fichas: ['tela_resumo()', 'comparar_fichas()', 'cautelas()'],
  explore: ['tela_resumo()', 'tela_estatisticas(coluna=y)', 'dicionario(termo=série)'],
}

const STUDY_NAMES: Record<string, [string, string, string]> = {
  'PSI-69': ['FLEX — Flame Extinguishment Experiment', 'Microgravidade (ISS)', 'Experimental'],
  'PSI-39': ['CFI — Cool Flames Investigation', 'Microgravidade (ISS)', 'Experimental'],
  'PSI-117': ['PSI-117 — Extinção de chamas quentes e frias de n-dodecano', 'Investigação em solo', 'Experimental e simulação'],
  'PSI-25': ['BASS-II — Burning and Suppression of Solids II', 'Microgravidade (ISS)', 'Experimental'],
  'PSI-142': ['PSI-142 — Extinção de chamas frias em contrafluxo (Princeton)', 'Investigação em solo', 'Pontos digitalizados de artigos'],
}
const STUDY_TOOLS = new Set(['cautelas', 'alertas', 'fonte_dos_dados', 'listar_investigacoes', 'inventario_arquivos'])
const isStudyTool = (label: string) => STUDY_TOOLS.has(label.split('(')[0] ?? '')

/** Fichas encenadas: o mesmo escopo que o servidor usa (a investigação da página, as da comparação, ou todas). */
function studiesFor(screen: Screen): Study[] {
  if (screen.pagina === 'explore') return []
  const ids = screen.escopo ?? (screen.investigacao ? [screen.investigacao] : Object.keys(STUDY_NAMES))
  return ids.map((id) => {
    const [nome, ambiente, tipo] = STUDY_NAMES[id] ?? [id, '—', '—']
    return {
      id,
      nome,
      categoria: 'Demonstração',
      ambiente,
      tipo_evidencia: tipo,
      pergunta: t(
        'Staged study sheet from demo mode: in real use, the question the investigation answers goes here.',
        'Ficha encenada do modo de demonstração: no uso real, aqui vem a pergunta que a investigação responde.',
      ),
      cautelas: t(
        'Do not compare with other investigations. Check the values against the NASA PSI portal. Measurement and model are different kinds of evidence.',
        'Não comparar com outras investigações. Conferir os valores com o portal NASA PSI. Medição e modelo são evidências diferentes.',
      ),
      url_nasa: `https://psi.nasa.gov/physci/repo/data/investigations/${id}`,
      relatorio: null,
      doi: null,
      fonte_carregada: id === 'PSI-69' ? 'FLEX_amostra_verificada.csv' : `${id}.xlsx`,
    }
  })
}

function answerFor(screen: Screen, question: string): string {
  const linhas = screen.dados?.length ?? 0
  const grafico = screen.graficos?.[0]?.split(':')[0] ?? t('main chart', 'gráfico principal')
  const en = [
    `**Summary.** In *${screen.titulo}*, the ${grafico.toLowerCase()} shows where the flame is sustained and where it goes out, considering the ${linhas || 'few'} records on screen with the current filters.`,
    '',
    '### What the data says',
    '',
    '- Most tests fall between **0.5 and 1.0 atm**, with an oxygen fraction of 0.15 to 0.21.',
    '- **Radiative extinction** dominates in the larger droplets; **diffusive extinction** appears once the droplet has shrunk.',
    '- Cool flames only show up after visible extinction and do not appear in the second chart.',
    '',
    '| Outcome | Tests | Median pressure |',
    '| --- | ---: | ---: |',
    '| Radiative extinction | 41 | 760 mmHg |',
    '| Diffusive extinction | 23 | 570 mmHg |',
    '| Complete burn | 12 | 380 mmHg |',
    '',
    `> Caution: ${linhas ? 'some' : 'the'} tests with no measured diameter are left out of the second scatter plot, and the legend says so.`,
    '',
    `About your question (“${question}”): the reading above holds for the filtered subset; change the pressure filter to see the limit shift. Use \`flex_agrupar\` to repeat the count.`,
  ]
  const pt = [
    `**Resumo.** Em *${screen.titulo}*, o ${grafico.toLowerCase()} mostra onde a chama se sustenta e onde ela se extingue, considerando os ${linhas || 'poucos'} registros que estão na tela com os filtros atuais.`,
    '',
    '### O que os dados dizem',
    '',
    '- A maior parte dos ensaios fica entre **0,5 e 1,0 atm**, com fração de oxigênio de 0,15 a 0,21.',
    '- A **extinção radiativa** domina nas gotas maiores; a **extinção difusiva** aparece quando a gota já encolheu.',
    '- As chamas frias surgem só depois da extinção visível e não aparecem no segundo gráfico.',
    '',
    '| Desfecho | Ensaios | Pressão mediana |',
    '| --- | ---: | ---: |',
    '| Extinção radiativa | 41 | 760 mmHg |',
    '| Extinção difusiva | 23 | 570 mmHg |',
    '| Queima completa | 12 | 380 mmHg |',
    '',
    `> Cautela: ${linhas ? 'alguns' : 'os'} ensaios sem diâmetro medido ficam fora da segunda dispersão, e isso é indicado na legenda.`,
    '',
    `Sobre a sua pergunta (“${question}”): a leitura acima vale para o recorte filtrado; mude o filtro de pressão para ver o limite se deslocar. Use \`flex_agrupar\` para repetir a contagem.`,
  ]
  return t(en, pt).join('\n')
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function* askDemo(
  mode: DemoMode,
  screen: Screen,
  history: ApiMessage[],
  question: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const asked = question.toLowerCase()
  const variant: DemoMode = asked.includes('erro') ? 'erro' : asked.includes('direto') ? 'direto' : asked.includes('jato') ? 'jato' : mode
  const pace = variant === 'lento' ? 2.6 : 1

  await sleep(700 * pace, signal)
  yield { type: 'studies', items: studiesFor(screen) }
  await sleep(1000 * pace, signal)

  if (variant === 'jato') {
    const text = answerFor(screen, question)
    for (const label of [...TOOLS[screen.pagina], 'cautelas(investigacao=PSI-69)', 'tela_linhas(limite=50)']) yield { type: 'tool', label, study: isStudyTool(label) }
    await sleep(3200, signal)
    yield { type: 'text', text: text.slice(0, 40) }
    await sleep(60, signal)
    yield { type: 'text', text: text.slice(40) }
    yield { type: 'done', cost: 0.0494, history: [...history, { role: 'user', content: question }, { role: 'assistant', content: text }] }
    return
  }

  if (variant !== 'direto') {
    const tools = TOOLS[screen.pagina]
    for (const [i, label] of tools.entries()) {
      yield { type: 'tool', label, study: isStudyTool(label) }
      await sleep((i === tools.length - 1 ? 1100 : 850) * pace, signal)
      if (variant === 'erro' && i === 0) {
        yield { type: 'tool', label: `${tools[1] ?? 'tela_resumo()'} · erro` }
        await sleep(700 * pace, signal)
        yield { type: 'error', message: t('The model provider refused the call (429: credit limit reached).', 'O provedor do modelo recusou a chamada (429: limite de créditos atingido).') }
        return
      }
    }
  }

  const text = answerFor(screen, question)
  for (let i = 0; i < text.length; ) {
    const size = 2 + Math.floor(Math.random() * 6)
    yield { type: 'text', text: text.slice(i, i + size) }
    i += size
    await sleep(16 * pace, signal)
  }
  await sleep(240, signal)
  yield {
    type: 'done',
    cost: variant === 'direto' ? 0.0412 : 0.1837,
    history: [...history, { role: 'user', content: question }, { role: 'assistant', content: text }],
  }
}
