/** Contratos da API (src/spaceapps/api). Os nomes seguem as colunas do banco. */

export type Cell = string | number | boolean | null
export type Row = Record<string, Cell>
export type ColumnKind = 'number' | 'string' | 'boolean' | 'date' | 'datetime' | 'other'

export interface Column {
  name: string
  kind: ColumnKind
}

/** Uma tabela como sai de `frames.dataset`: colunas tipadas e linhas como objetos. */
export interface Dataset<T extends object = Row> {
  columns: Column[]
  rows: T[]
}

export interface Investigation {
  id: string
  nome: string
  categoria: string
  ambiente: string
  tipo_evidencia: string
  tabela: string
  pergunta: string
  cautelas: string
  url_nasa: string
  doi: string | null
  relatorio: string | null
  fonte_carregada: string | null
  fontes_carregadas: string | null
  /** `envio` nos estudos enviados pela tela; os do catálogo têm leitor próprio. */
  origem?: string | null
  /** O que o cabeçalho mostra além da identificação (vem com a página de cada estudo). */
  ficha?: FichaItem[]
  vinculos?: FichaLink[]
  portal?: Portal | null
  publicacoes?: Publication[]
}

/** Um item da ficha do estudo: o que foi testado, em que condição ou o que se mediu, e de onde saiu. */
export interface FichaItem {
  secao: string
  atributo: string | null
  rotulo: string
  valores: string | null
  unidade: string | null
  minimo: number | null
  maximo: number | null
  /** variou | fixo | medido | simulado | documento | divergente | derivado | digitalizado | sem dados */
  situacao: string
  origem: string
  evidencia: string | null
  nota: string | null
  grandeza: string | null
}

/** Duas condições que não variaram de forma independente. */
export interface FichaLink {
  variavel_a: string
  variavel_b: string
  exemplos: string
}

/** Metadados do portal NASA PSI, no idioma original. */
export interface Portal {
  arquivo_metadados: string
  equipamento: string | null
  plataforma: string | null
  centro_nasa: string | null
  inicio: string | null
  fim: string | null
  objetivo: string | null
  hipotese: string | null
  abordagem: string | null
  [field: string]: string | null
}

export interface Publication {
  titulo: string
  link: string | null
}

export interface AlertRow {
  investigacao: string
  teste_id: string | null
  campo: string | null
  valor_original: string | null
  tipo: string
  detalhe: string
  [column: string]: Cell
}

export interface OverviewCard extends Investigation {
  unidade: string
  linhas: number
  alertas: number
  amostra: boolean
}

export interface Overview {
  meta: { gerado_em: string; geral: string; [key: string]: unknown }
  investigacoes: OverviewCard[]
  comparacao_disponivel: boolean
  faltando: string[]
  status_fontes: { status: string; n: number }[]
  fontes: Dataset
  alertas: Dataset<AlertRow>
}

export interface FlexRow {
  teste_id: string
  identificador: string | null
  combustivel: string
  desfecho: string
  pressao_mmhg: number | null
  oxigenio_fracao: number | null
  helio_fracao: number | null
  diametro_inicial_mm: number | null
  diametro_extincao_visivel_mm: number | null
  [column: string]: Cell
}

export interface BassRow {
  teste_id: string
  pesquisador: string
  material_original: string
  material_categoria: string
  geometria: string
  o2_inicial_pct: number | null
  delta_co2_pp: number | null
  [column: string]: Cell
}

export interface CfiRow {
  teste_id: string
  combustivel: string
  diluente: string
  pressao_atm: number | null
  d0_mm: number | null
  dext_quente_mm: number | null
  dext_fria_mm: number | null
  dext_fria_zero_na_fonte: boolean | null
  analise_completa: boolean | null
  [column: string]: Cell
}

export interface Psi117Point {
  tipo_chama: string
  serie: string
  pressao_atm: number
  diametro_extincao_mm: number
  [column: string]: Cell
}

export interface Psi117Comparison {
  tipo_chama: string
  pressao_atm: number
  medido_mm: number | null
  n_medicoes: number | null
  modelo_mm: number | null
  limite_inferior_mm: number | null
  limite_superior_mm: number | null
  diferenca_mm: number | null
  modelo_na_faixa: boolean | null
  [column: string]: Cell
}

export interface Psi142Set {
  conjunto_id: number
  publicacao: string | null
  figura: string | null
  descricao_planilha: string | null
  descricao_csv: string | null
  doi: string | null
  [column: string]: Cell
}

export interface Psi142Point {
  conjunto_id: number
  serie: string
  x_nome: string
  x: number
  y_nome: string
  y: number
  [column: string]: Cell
}

export interface Correspondence {
  tabela_psi117: string
  tipo_chama: string
  pressao_atm: number | null
  d0_mm: number | null
  cfi_teste_id: string | null
  situacao: string
  [column: string]: Cell
}

export interface FlexPage {
  investigacao: Investigation
  ensaios: Dataset<FlexRow>
  alertas: Dataset<AlertRow>
}

export interface BassPage {
  investigacao: Investigation
  testes: Dataset<BassRow>
  alertas: Dataset<AlertRow>
}

export interface CfiPage {
  investigacao: Investigation
  ensaios: Dataset<CfiRow>
  resumo: Dataset
  cameras: Dataset
  alertas: Dataset<AlertRow>
}

export interface Psi117Page {
  investigacao: Investigation
  pontos: Dataset<Psi117Point>
  comparacao: Dataset<Psi117Comparison>
  extincao_1atm: Dataset | null
  series_modelo: Dataset | null
  tabelas: Dataset | null
  alertas: Dataset<AlertRow>
}

export interface Psi142Page {
  investigacao: Investigation
  conjuntos: Dataset<Psi142Set>
  total_pontos: number
  alertas: Dataset<AlertRow>
}

export interface ComparisonPage {
  psi117: Dataset<Psi117Comparison>
  cfi: Dataset<CfiRow>
  correspondencia: Dataset<Correspondence>
  condicoes: Record<string, Cell> | null
  investigacoes: Investigation[]
}

// ---------- Estudos, fichas lado a lado e envio ---------------------------------------------------

export interface StudyCard extends Investigation {
  linhas: number
  alertas: number
  amostra: boolean
  enviado: boolean
  combustiveis: string[]
  formas: string[]
  /** Faixas da ficha, na unidade comum: O₂ em fração molar, pressão em atm. */
  oxigenio: [number, number] | null
  pressao: [number, number] | null
  /** Índice de busca: (onde, texto original). */
  busca: [string, string][]
}

export interface StudiesPage {
  estudos: StudyCard[]
}

/** O que cada coluna de um estudo enviado é, e de onde saiu essa leitura. */
export interface DictionaryRow {
  tabela: string
  coluna: string
  origem: string | null
  descricao: string | null
  unidade: string | null
  natureza: string
  tipo: string
  evidencia_tipo: string | null
  evidencia_arquivo: string | null
  evidencia_pagina: number | null
  evidencia_trecho: string | null
  confirmado: boolean | null
  [column: string]: Cell
}

export interface SubmittedStudyPage {
  investigacao: Investigation
  dicionario: DictionaryRow[]
  tabelas: Record<string, Dataset>
  sugestoes: Dataset | null
  alertas: Dataset<AlertRow>
}

export interface SheetsPage {
  disponivel: boolean
  estudos: { id: string; nome: string }[]
  padrao: string[]
}

export interface SheetPair {
  a: string
  b: string
  veredito: string
  sobrepoe: string[]
  nao_sobrepoe: string[]
  so_um: string[]
  grandezas_comuns: string[]
  combustiveis_comuns: string[]
  avisos: string[]
}

export interface SheetBand {
  atributo: string
  rotulo: string
  unidade: string
  estudos: { id: string; minimo: number; maximo: number; texto: string }[]
  janela: [number, number] | null
}

export interface SheetComparison {
  pares: SheetPair[]
  janelas_comuns: Record<string, string>
  faixas: SheetBand[]
  tabela: Dataset
}

export interface Vocabulary {
  naturezas: string[]
  tipos: string[]
  atributos: { chave: string; rotulo: string; unidade: string | null }[]
  atributos_condicao: string[]
  grandezas: { chave: string; rotulo: string; unidade: string | null }[]
  limite_caracteres: number
  limite_paginas_pdf: number
}

export interface StoredFile {
  caminho: string
  tipo: string
  tamanho: number
  origem: string
}

/** De onde saiu uma interpretação da IA. */
export interface Evidence {
  tipo?: string | null
  arquivo?: string | null
  pagina?: number | null
  trecho?: string | null
}

export interface SpecColumn {
  origem: string
  destino?: string
  natureza: string
  tipo?: string
  unidade?: string | null
  atributo?: string | null
  grandeza?: string | null
  descricao?: string
  evidencia?: Evidence
  confirmado?: boolean
  valores_especiais?: { valor: Cell; significado: string }[] | null
}

export interface SpecTable {
  nome: string
  layout: string
  descricao?: string
  fontes: { arquivo: string; aba?: string | null; linha_cabecalho: number; rotulo?: string | null }[]
  colunas: SpecColumn[]
  excluir_linhas?: { coluna: string; valores: Cell[]; motivo: string }[] | null
}

export interface SheetGoal {
  texto?: string
  evidencia?: Evidence
  conferido?: boolean
  confirmado?: boolean
}

export interface SheetCondition {
  atributo?: string | null
  valor?: string | null
  minimo?: number | null
  maximo?: number | null
  unidade?: string | null
  planejado?: boolean
  evidencia?: Evidence
  conferido?: boolean
  confirmado?: boolean
}

export interface SheetSensor {
  nome?: string | null
  mede?: string | null
  grandeza?: string | null
  planejado?: boolean
  evidencia?: Evidence
  conferido?: boolean
  confirmado?: boolean
}

/** Ficha lida dos documentos, em revisão. */
export interface DocSheet {
  objetivo?: SheetGoal | null
  condicoes?: SheetCondition[]
  sensores?: SheetSensor[]
}

/** Especificação de leitura proposta pela IA e editada na revisão. */
export interface Spec {
  investigacao: {
    id: string
    nome?: string
    categoria?: string
    ambiente?: string
    tipo_evidencia?: string
    pergunta?: string
    cautelas?: { texto: string; evidencia?: Evidence }[]
    [field: string]: unknown
  }
  tabelas: SpecTable[]
  lacunas?: string[]
  ficha?: DocSheet | null
  comparacoes_sugeridas?: Row[]
  [field: string]: unknown
}

export interface AnalysisEstimate {
  modelo: string
  abas?: number
  documentos: number
  documentos_cortados: boolean
  tokens_entrada_aprox: number
  custo_zyt_aprox: number
}

export interface ProposalInfo {
  modelo: string
  criada_em: string
  tentativas?: number
  custo_zyt: number | null
}

export interface SpecCheck {
  problemas: string[]
  previa: { tabelas: { nome: string; linhas: number; dados: Dataset }[]; alertas: Dataset | null } | null
  previa_erro: string | null
}

interface UploadBase {
  id: string
  psi: string
  criado_em: string
  /** recebido → proposto → aprovado */
  estado: string
  arquivos: StoredFile[]
  avisos: string[]
  analise: AnalysisEstimate | null
  proposta: ProposalInfo | null
}

export interface StudyUpload extends UploadBase {
  especificacao: Spec | null
  conferencia: SpecCheck | null
  gravadas?: Record<string, number>
}

export interface SheetCheck {
  problemas: string[]
  itens: number
  desmarcados: number
}

export interface DocsUpload extends UploadBase {
  estudo: { id: string; nome: string; origem: string | null }
  ficha: DocSheet | null
  conferencia: SheetCheck | null
  ja_existe: boolean
}
