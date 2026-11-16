import { lang } from '@/shared/lib/i18n'
import { COLUMNS } from '@/shared/lib/i18n-columns'

/**
 * Tradução do texto que vem do banco. O banco é gerado em português (catálogo, alertas, fichas,
 * fontes) e continua assim; com a interface em inglês, este módulo troca o que conhece e deixa
 * passar o resto como veio (um estudo enviado, por exemplo, fica no idioma em que foi descrito).
 *
 * São duas camadas:
 * - `TEXT` e `RULES`: frases, rótulos e textos montados pela carga. São trocados já na chegada da
 *   resposta (`translateResponse`, chamado pelo cliente da API), porque nenhum código compara frases.
 * - `VALUES`: valores de domínio (desfecho, tipo de chama, status, situação…). O código filtra,
 *   colore e compara por eles, então chegam intactos e só são trocados ao exibir, com `td()`.
 */

const VALUES: Record<string, string> = {
  // desfecho (FLEX)
  Extinção: 'Extinction',
  'Ruptura da gota': 'Droplet disruption',
  'Queima completa': 'Complete burn',
  // tipo de chama e séries do PSI-117
  'Chama fria': 'Cool flame',
  'Chama quente': 'Hot flame',
  Medição: 'Measurement',
  Modelo: 'Model',
  'Limite inferior': 'Lower bound',
  'Limite superior': 'Upper bound',
  MEDIDO: 'MEASURED',
  SIMULADO: 'SIMULATED',
  INCERTEZA: 'UNCERTAINTY',
  DERIVADO: 'DERIVED',
  CONDICAO: 'CONDITION',
  IDENTIFICADOR: 'IDENTIFIER',
  DIGITALIZADO: 'DIGITIZED',
  DOCUMENTO: 'DOCUMENT',
  IGNORAR: 'IGNORE',
  // fontes
  Carregado: 'Loaded',
  'Não carregado': 'Not loaded',
  'Duplicata exata': 'Exact duplicate',
  Documentação: 'Documentation',
  'Não reconhecido': 'Not recognized',
  // BASS-II
  'Não escrito na fonte': 'Not written in the source',
  'Nomex (tecido)': 'Nomex (fabric)',
  'SIBAL (tecido)': 'SIBAL (fabric)',
  'Cera (vela)': 'Wax (candle)',
  Haste: 'Rod',
  Tecido: 'Fabric',
  Filme: 'Film',
  Placa: 'Slab',
  Vela: 'Candle',
  'Seção esférica': 'Spherical section',
  Transparente: 'Clear',
  Preta: 'Black',
  // combustíveis e gases
  'n-dodecano': 'n-dodecane',
  'n-decano': 'n-decane',
  'n-heptano': 'n-heptane',
  Farnesano: 'Farnesane',
  'n-dodecano/iso-dodecano 60/40': 'n-dodecane/iso-dodecane 60/40',
  'n-dodecano/iso-dodecano 75/25': 'n-dodecane/iso-dodecane 75/25',
  Metanol: 'Methanol',
  Hélio: 'Helium',
  Nitrogênio: 'Nitrogen',
  // ficha
  fixo: 'fixed',
  variou: 'varied',
  medido: 'measured',
  simulado: 'simulated',
  derivado: 'derived',
  digitalizado: 'digitized',
  documento: 'document',
  divergente: 'divergent',
  'sem dados': 'no data',
  dados: 'data',
  catálogo: 'catalog',
  envio: 'upload',
  'descrição da investigação': 'investigation description',
  'ReadMe da investigação': 'investigation ReadMe',
  'não informada': 'not stated',
  'a conferir': 'to be checked',
  'fração molar': 'mole fraction',
  quadros: 'frames',
  contagem: 'count',
  'p.p.': 'pp',
  'dia do ano (GMT)': 'day of year (GMT)',
  // tipos de coluna e de evidência (estudos enviados)
  numero: 'number',
  texto: 'text',
  categoria: 'category',
  data: 'date',
  inferido: 'inferred',
  cabecalho: 'header',
  // comparação de fichas
  'Janela comparável': 'Comparable window',
  'Combustíveis diferentes': 'Different fuels',
  'Condições sem sobreposição': 'Conditions do not overlap',
  'Sem condição numérica em comum': 'No numeric condition in common',
  'Nada medido em comum': 'Nothing measured in common',
  // PSI-117 × CFI
  'mesmo ensaio': 'same test',
  'mesmo valor de um ensaio': 'same value as one test',
  'mesmo ensaio, valor diferente': 'same test, different value',
  'sem ensaio individual igual (pode ser média ou outro tratamento)': 'no matching individual test (may be a mean or other processing)',
  'extinção a 1 atm': 'extinction at 1 atm',
  'extinção por pressão': 'extinction by pressure',
  'chama fria oscilatória': 'oscillatory cool flame',
  // tipos de alerta
  metadado_divergente: 'divergent metadata',
  metadado_conflitante: 'conflicting metadata',
  eixo_suspeito: 'suspect axis',
  espacos_no_id: 'spaces in id',
  fracao_suspeita: 'suspect fraction',
  medicao_repetida: 'repeated measurement',
  variacao_extrema: 'extreme change',
  valor_nao_numerico: 'non-numeric value',
  valor_zero: 'zero value',
  valor_ausente: 'missing value',
  data_x_gmt: 'date vs. GMT',
  data_suspeita: 'suspect date',
  valor_negativo: 'negative value',
  divergencia_entre_fontes: 'sources disagree',
  data_invalida: 'invalid date',
  // estado de um envio
  recebido: 'received',
  analisado: 'analyzed',
  aprovado: 'approved',
  descartado: 'discarded',
  // onde a busca achou a palavra
  nome: 'name',
  ambiente: 'environment',
  evidência: 'evidence',
  pergunta: 'question',
  cautelas: 'cautions',
  sigla: 'acronym',
  equipamento: 'hardware',
  'palavras-chave': 'keywords',
  objetivo: 'objective',
  hipótese: 'hypothesis',
}

const TEXT: Record<string, string> = {
  // ---- investigações: nome, categoria, ambiente, evidência
  'PSI-117 — Extinção de chamas quentes e frias de n-dodecano': 'PSI-117 — Extinction of hot and cool n-dodecane flames',
  'PSI-142 — Extinção de chamas frias em contrafluxo (Princeton)': 'PSI-142 — Extinction of counterflow cool flames (Princeton)',
  'Chama em contrafluxo': 'Counterflow flame',
  'Gota de combustível líquido': 'Liquid fuel droplet',
  'Gota de combustível líquido · chama fria': 'Liquid fuel droplet · cool flame',
  'Material sólido': 'Solid material',
  'Medição × modelo': 'Measurement × model',
  'Microgravidade (ISS)': 'Microgravity (ISS)',
  'Investigação em solo': 'Ground investigation',
  'Experimental e simulação': 'Experimental and simulation',
  'Pontos digitalizados de artigos': 'Points digitized from papers',
  Ensaios: 'Tests',
  Testes: 'Tests',
  Pontos: 'Points',
  Linhas: 'Rows',

  // ---- perguntas
  'Como pressão, hélio e combustível mudam a queima e a extinção das chamas quente e fria de gotas de n-dodecano?':
    'How do pressure, helium and fuel change the burning and extinction of the hot and cool flames of n-dodecane droplets?',
  'Em que condições de pressão, oxigênio e tamanho de gota a chama visível se extinguiu?':
    'Under what pressure, oxygen and droplet-size conditions did the visible flame extinguish?',
  'Em que pressões o diâmetro de extinção previsto pelo modelo difere do medido?':
    'At which pressures does the extinction diameter predicted by the model differ from the measured one?',
  'Em que taxa de estiramento e fração de combustível as chamas frias e quentes de n-alcanos se extinguem, com e sem ozônio?':
    'At what strain rate and fuel fraction do cool and hot n-alkane flames extinguish, with and without ozone?',
  'Quais amostras de combustível sólido (material, geometria e tamanho) foram queimadas na ISS com o hardware BASS, em que data e em que ordem de execução. A tabela é só um registro de ensaios e não traz resultados de queima ou extinção.':
    'Which solid fuel samples (material, geometry and size) were burned on the ISS with the BASS hardware, on what date and in what run order. The table is only a test log and has no burning or extinction results.',
  'Que materiais, geometrias, níveis de O2 e ventilação foram testados, e o que se mediu?':
    'Which materials, geometries, O2 levels and ventilation settings were tested, and what was measured?',

  // ---- cautelas
  "O fim da chama visível não prova que toda combustão parou: chamas frias seguem invisíveis. 'Disruption' é a classificação do fim do ensaio de gota, não uma explosão. O cabeçalho da coluna 'CO' perdeu o subscrito do gás; não tratá-la como CO2 sem confirmar. A unidade de 'Burning rate; mm' precisa ser conferida no relatório. Filtrar só extinções não isola o efeito do oxigênio: gota e pressão também mudam.":
    "The end of the visible flame does not prove that all combustion stopped: cool flames carry on unseen. 'Disruption' is the classification of how the droplet test ended, not an explosion. The 'CO' column header lost the gas subscript; do not treat it as CO2 without confirming. The unit of 'Burning rate; mm' needs to be checked in the report. Filtering only extinctions does not isolate the effect of oxygen: droplet size and pressure change too.",
  "A tabela não tem rótulo de risco: não ranquear materiais por segurança a partir dela. 'Fan display' e 'Air display' são leituras de painel, não velocidades calibradas em cm/s. Variação de CO/CO2 depende de duração, volume e protocolo; não equivale a risco do material. Hastes e filmes sem material escrito provavelmente são PMMA, mas isso não está na fonte.":
    "The table has no risk label: do not rank materials by safety from it. 'Fan display' and 'Air display' are panel readings, not velocities calibrated in cm/s. The change in CO/CO2 depends on duration, volume and protocol; it is not the same as material risk. Rods and films with no material written are probably PMMA, but the source does not say so.",
  "Dext,cool = 0 na fonte quer dizer que a gota foi consumida sem extinção visível da chama fria, não um diâmetro de 0 mm: esses casos ficam vazios e marcados. 81 dos 227 ensaios estão com análise não concluída (Completed Analysis = No). Parte dos diâmetros de extinção da chama fria foi extrapolada (Extrap CF?). O diâmetro de extinção depende do diâmetro inicial da gota: compare ensaios com D0 parecido. As colunas de radiometria e o tempo de chama quente não informam unidade. O 'Flex Number' é a numeração dos ensaios no aparelho do FLEX, não um ensaio do PSI-69.":
    "Dext,cool = 0 in the source means the droplet was consumed with no visible cool-flame extinction, not a 0 mm diameter: those cases are left empty and flagged. 81 of the 227 tests have unfinished analysis (Completed Analysis = No). Some cool-flame extinction diameters were extrapolated (Extrap CF?). The extinction diameter depends on the initial droplet diameter: compare tests with similar D0. The radiometry columns and the hot-flame time state no unit. The 'Flex Number' is the test numbering on the FLEX apparatus, not a PSI-69 test.",
  "Medição e modelo são evidências diferentes e não se misturam numa mesma média. A diferença entre eles precisa ser lida contra a faixa de incerteza informada, que só existe para a chama fria. A associação desta tabela às publicações do PSI-117 ainda precisa ser confirmada. O modelo foi calibrado com dados de voo do FLEX, e os ensaios do CFI rodaram no mesmo aparelho: a 'medição' desta tabela pode vir desses mesmos voos, então compará-la com o CFI não é validação independente.":
    "Measurement and model are different kinds of evidence and are not mixed into one average. The difference between them must be read against the stated uncertainty range, which exists only for the cool flame. The link between this table and the PSI-117 publications still needs to be confirmed. The model was calibrated with FLEX flight data, and the CFI tests ran on the same apparatus: the 'measurement' in this table may come from those same flights, so comparing it with CFI is not independent validation.",
  'São pontos tirados de figuras publicadas, não medições brutas: a precisão é a da digitalização. As chamas são de contrafluxo, não gotas: o limite é uma taxa de estiramento (1/s), que não se compara diretamente com o diâmetro de extinção de uma gota. Planilha e CSV discordam sobre o ozônio nos conjuntos 1 e 2 e sobre os DOIs dos conjuntos 6 a 8: confira no artigo antes de citar. No conjunto 6, as séries nC10 e nC7 parecem ter as colunas x e y trocadas na fonte.':
    'These are points taken from published figures, not raw measurements: the precision is that of the digitization. The flames are counterflow flames, not droplets: the limit is a strain rate (1/s), which is not directly comparable with the extinction diameter of a droplet. The spreadsheet and the CSV disagree about ozone in sets 1 and 2 and about the DOIs of sets 6 to 8: check the paper before citing. In set 6, the nC10 and nC7 series appear to have the x and y columns swapped in the source.',
  "A tabela enviada é um registro de execução (data, dia GMT, ordem, número do ensaio, amostra, material). Não tem vazão de ar, fração de O2, taxa de espalhamento, tempo de queima nem desfecho de extinção. Com ela não dá para concluir nada sobre flamabilidade ou supressão. Esses resultados estão nas imagens e vídeos do PSI e nas apresentações. A velocidade de escoamento, que é a variável principal do estudo, não está na tabela. Ela aparece nos documentos só como faixa planejada (5 a 50 cm/s) e como exemplos pontuais. Não atribua velocidade a nenhuma linha a partir da matriz de testes planejada. A matriz de testes dos documentos de revisão (SRD, SAR-1) é um plano de voo de 2010. O registro de voo não segue exatamente esse plano. Os números de Test # chegam a 119, mas a matriz do SAR-1 termina no teste 89. A Sample # do CSV também não bate com a matriz: por exemplo, o Test 18 aparece com Sample 19 e PMMA 1 cm, enquanto a matriz coloca o teste 18 na amostra 18. Não use a matriz planejada para preencher ou corrigir Test # e Sample #. Os números de ensaio não são únicos. 'As Run Test #' tem 116 valores distintos em 121 linhas preenchidas, e 'Test #' tem 117 distintos. Há repetições, que podem ser reexecuções ou erros de digitação. Não trate nenhum dos dois como chave única sem confirmar. 'Fuel Sample Material' mistura material, geometria e tamanho num só texto (ex.: 'PMMA sphere 2 cm', 'SIBAL 1 cm', 'Nomex blend 2 cm'). Para PMMA, 2 cm é diâmetro da esfera. Para as folhas finas, é largura. Não compare os 'cm' entre geometrias diferentes. Também há variações de grafia, como 'PMMA 2 cm' e 'PMMA sphere 2 cm', que podem ser o mesmo material ou geometrias diferentes. A contagem de ensaios é aproximada. A apresentação de 2013 cita '41 samples, 115 burns completed'. O CSV tem 'As Run Test #' até 116 e Sample # até 44. Não assuma que toda linha foi uma queima bem-sucedida, e não use o total do CSV como número de queimas completadas. A coluna GMT contém números de 90 a 234. Pelo pareamento com a data (30/3/2012 corresponde a 90), parece ser o dia do ano em GMT, e não um horário. É uma leitura deduzida, sem texto de documento que a confirme. O DLD diz que os dados do PSI estão divididos em BASS_2012 e BASS_2013. Não se sabe se esta tabela cobre só 2012 ou os dois anos. As datas de exemplo são todas de 2012.":
    "The uploaded table is a run log (date, GMT day, order, test number, sample, material). It has no air flow rate, O2 fraction, spread rate, burn time or extinction outcome. Nothing about flammability or suppression can be concluded from it. Those results are in the PSI images and videos and in the presentations. The flow velocity, which is the main variable of the study, is not in the table. It appears in the documents only as a planned range (5 to 50 cm/s) and as isolated examples. Do not assign a velocity to any row from the planned test matrix. The test matrix in the review documents (SRD, SAR-1) is a 2010 flight plan. The flight log does not follow that plan exactly. Test # numbers go up to 119, but the SAR-1 matrix ends at test 89. The Sample # in the CSV does not match the matrix either: for example, Test 18 appears with Sample 19 and PMMA 1 cm, while the matrix puts test 18 on sample 18. Do not use the planned matrix to fill in or correct Test # and Sample #. Test numbers are not unique. 'As Run Test #' has 116 distinct values in 121 filled rows, and 'Test #' has 117 distinct ones. There are repeats, which may be reruns or typing errors. Do not treat either as a unique key without confirming. 'Fuel Sample Material' mixes material, geometry and size in a single text (e.g. 'PMMA sphere 2 cm', 'SIBAL 1 cm', 'Nomex blend 2 cm'). For PMMA, 2 cm is the sphere diameter. For the thin sheets, it is the width. Do not compare the 'cm' across different geometries. There are also spelling variants, such as 'PMMA 2 cm' and 'PMMA sphere 2 cm', which may be the same material or different geometries. The test count is approximate. The 2013 presentation mentions '41 samples, 115 burns completed'. The CSV has 'As Run Test #' up to 116 and Sample # up to 44. Do not assume every row was a successful burn, and do not use the CSV total as the number of completed burns. The GMT column holds numbers from 90 to 234. From the pairing with the date (3/30/2012 corresponds to 90), it appears to be the day of the year in GMT, not a time. This is a deduced reading, with no document text confirming it. The DLD says the PSI data is split into BASS_2012 and BASS_2013. It is not known whether this table covers only 2012 or both years. The example dates are all from 2012.",

  // ---- alertas
  'Chama fria com extinção 0: sem extinção visível (gota consumida) ou sem chama fria.':
    'Cool flame with extinction 0: no visible extinction (droplet consumed) or no cool flame.',
  'Concentração negativa: provável desvio do sensor.': 'Negative concentration: probably sensor drift.',
  'Célula vazia na fonte.': 'Empty cell in the source.',
  'Data que não pôde ser lida.': 'Date that could not be read.',
  'Diâmetro zero: pode indicar ausência de chama fria nessa pressão. Confirmar no artigo.':
    'Zero diameter: may mean there was no cool flame at this pressure. Confirm in the paper.',
  'Identificador com espaço extra na fonte.': 'Identifier with an extra space in the source.',
  'Mais de uma medição na mesma pressão; a barra de erro da fonte não diz a qual se refere.':
    'More than one measurement at the same pressure; the source error bar does not say which one it refers to.',
  'Planilha e CSV descrevem o conjunto de formas diferentes.': 'The spreadsheet and the CSV describe the set differently.',
  'Planilha e CSV discordam sobre a presença de ozônio. Conferir no artigo.':
    'The spreadsheet and the CSV disagree about the presence of ozone. Check the paper.',
  'Simulação com extinção 0 nas duas chamas: provável ausência de chama nesse D0. Conferir.':
    'Simulation with extinction 0 for both flames: probably no flame at this D0. Check.',
  'Texto em coluna numérica; mantido só no alerta.': 'Text in a numeric column; kept only in the alert.',
  'Zero na fonte: sem extinção visível da chama fria (gota consumida). Não é 0 mm medido.':
    'Zero in the source: no visible cool-flame extinction (droplet consumed). It is not a measured 0 mm.',
  '0 e 0': '0 and 0',

  // ---- ficha: rótulos, atributos e grandezas
  Anemômetro: 'Anemometer',
  Combustível: 'Fuel',
  'Combustível ou material': 'Fuel or material',
  'Câmeras de vídeo e fotográficas': 'Video and still cameras',
  'Desfecho do ensaio': 'Test outcome',
  'Diâmetro (hastes e esferas)': 'Diameter (rods and spheres)',
  'Diâmetro de extinção': 'Extinction diameter',
  'Diâmetro de extinção (medido e simulado)': 'Extinction diameter (measured and simulated)',
  'Diâmetro de extinção da chama fria': 'Cool-flame extinction diameter',
  'Diâmetro de extinção da chama quente': 'Hot-flame extinction diameter',
  'Diâmetro inicial da gota': 'Initial droplet diameter',
  'Diâmetro na extinção visível': 'Diameter at visible extinction',
  'Formato da amostra': 'Sample shape',
  'Formato da chama': 'Flame shape',
  'Gota presa em fibra': 'Fiber-supported droplet',
  'Grandezas nos gráficos': 'Quantities in the charts',
  "Gás com rótulo 'CO' (ambíguo)": "Gas labeled 'CO' (ambiguous)",
  Oxigênio: 'Oxygen',
  'Oxigênio inicial': 'Initial oxygen',
  Pressão: 'Pressure',
  Diluente: 'Diluent',
  Geometria: 'Geometry',
  Espessura: 'Thickness',
  Largura: 'Width',
  Material: 'Material',
  'Material amostra': 'Sample material',
  'Amostra id': 'Sample id',
  Objetivo: 'Objective',
  Ventilador: 'Fan',
  Ventilação: 'Ventilation',
  Temperatura: 'Temperature',
  'O2 final': 'Final O2',
  'CO produzido (final − inicial)': 'CO produced (final − initial)',
  'CO2 produzido (final − inicial)': 'CO2 produced (final − initial)',
  'Quadros filmados': 'Frames recorded',
  'Outra condição': 'Other condition',
  'Outra medição': 'Other measurement',
  'Agente extintor': 'Extinguishing agent',
  'Radiometria (pico da chama quente)': 'Radiometry (hot-flame peak)',
  Radiômetro: 'Radiometer',
  Reignições: 'Reignitions',
  'Restritor de fluxo': 'Flow restrictor',
  'Série da figura (combustível ou condição)': 'Figure series (fuel or condition)',
  'Tamanho do queimador': 'Burner size',
  'Tamanho da amostra': 'Sample size',
  'Suporte da amostra': 'Sample support',
  'Taxa de queima': 'Burning rate',
  'Taxa de queima (chama fria)': 'Burning rate (cool flame)',
  'Taxa de queima (chama quente)': 'Burning rate (hot flame)',
  'Tempo de queima': 'Burn time',
  'Velocidade do fluxo': 'Flow velocity',
  'Taxa de estiramento na extinção': 'Strain rate at extinction',
  'Temperatura da chama': 'Flame temperature',
  'Gases consumidos ou produzidos': 'Gases consumed or produced',
  'Emissão da chama (luz, radiação, quimiluminescência)': 'Flame emission (light, radiation, chemiluminescence)',
  Combustíveis: 'Fuels',
  Amostras: 'Samples',
  Condições: 'Conditions',
  Medições: 'Measurements',
  'Equipamento (portal)': 'Hardware (portal)',
  'sem faixa comum a todos': 'no range common to all',

  // ---- ficha: valores e notas
  '2 bocais necessários, diâmetro 3,2 mm (comprimento normal e curto)': '2 nozzles required, 3.2 mm diameter (normal and short length)',
  'Aproximar o método NASA-STD-6001 Teste #1 em gravidade normal, os testes de microgravidade em solo e a inflamabilidade real em microgravidade, observando chamas por tempos mais longos, com combustíveis espessos, geometrias típicas e chamas de esteira. Avaliar a eficácia de um agente extintor gasoso inerte sobre diferentes materiais, geometrias, pré-aquecimento e fluxo.':
    'Bring together the NASA-STD-6001 Test #1 method in normal gravity, ground-based microgravity tests and actual flammability in microgravity, observing flames for longer times, with thick fuels, typical geometries and wake flames. Assess the effectiveness of an inert gaseous extinguishing agent on different materials, geometries, preheating and flow.',
  'Emissão (radiação) da chama': 'Flame emission (radiation)',
  'Imagens da chama (vídeo e fotos)': 'Flame images (video and photos)',
  'Velocidade real do fluxo de ar em co-fluxo': 'Actual velocity of the co-flow air stream',
  'chama em contrafluxo (jatos opostos)': 'counterflow flame (opposed jets)',
  'concentração de O2 igual ou acima de 21%': 'O2 concentration at or above 21%',
  'esferas de PMMA de 1 e 2 cm, folhas de SIBAL de 1 e 2 cm de largura, amostra plana de cera e PMMA de 1 cm de largura, vela dentro de tubo':
    '1 and 2 cm PMMA spheres, SIBAL sheets 1 and 2 cm wide, flat wax and PMMA sample 1 cm wide, candle inside a tube',
  'gota esférica': 'spherical droplet',
  'gota esférica (modelo e voos)': 'spherical droplet (model and flights)',
  'nitrogênio pelo bocal, a partir de garrafas pressurizadas via controlador de fluxo mássico, de 0 a 500 cc/min':
    'nitrogen through the nozzle, from pressurized bottles via a mass flow controller, from 0 to 500 cc/min',
  'o combustível queima cerca de um minuto antes do início do fluxo de nitrogênio': 'the fuel burns for about a minute before the nitrogen flow starts',
  'pressão ambiente do Shuttle': 'Shuttle ambient pressure',
  'velocidade do ar ajustável de 5 a 50 cm/s': 'air velocity adjustable from 5 to 50 cm/s',
  'Cada ponto diz a grandeza do eixo y da figura digitalizada.': 'Each point states the y-axis quantity of the digitized figure.',
  'Código da configuração.': 'Configuration code.',
  'Leituras de painel em texto livre, sem calibração.': 'Panel readings in free text, uncalibrated.',
  "Material, geometria e tamanho do combustível, em texto livre (ex.: 'SIBAL 2 cm', 'PMMA sphere 1 cm', 'Nomex blend 2 cm').":
    "Material, geometry and size of the fuel, in free text (e.g. 'SIBAL 2 cm', 'PMMA sphere 1 cm', 'Nomex blend 2 cm').",
  'Número da amostra física de combustível usada (amostras reutilizadas em mais de um ensaio, ex.: Sample 24 em vários testes de esfera de PMMA de 2 cm).':
    'Number of the physical fuel sample used (samples reused in more than one test, e.g. Sample 24 in several 2 cm PMMA sphere tests).',
  'O cabeçalho perdeu o subscrito; pode ser CO2.': 'The header lost the subscript; it may be CO2.',
  'O documento descreve o planejado (requisito), não necessariamente o que foi feito.':
    'The document describes what was planned (requirement), not necessarily what was done.',
  'Por tabela da investigação, conforme o ReadMe.': 'Per investigation table, according to the ReadMe.',
  'Data de execução do ensaio, em formato m/d/aaaa (ex.: 3/30/2012).': 'Date the test was run, in m/d/yyyy format (e.g. 3/30/2012).',
  'Dia do ano em GMT do ensaio (90 corresponde a 30/3/2012). Não é horário.': 'Day of the year in GMT of the test (90 corresponds to 3/30/2012). It is not a time.',
  'Identificador do teste na matriz de testes (Test ID). Fica como texto porque 15 das 121 células preenchidas não são numéricas, e o perfil não mostra quais são.':
    'Test identifier in the test matrix (Test ID). Kept as text because 15 of the 121 filled cells are not numeric, and the profile does not show which ones.',
  'Número sequencial do ensaio na ordem em que foi executado a bordo (1 a 116). Há valores repetidos e uma linha sem valor.':
    'Sequential test number in the order it was run on board (1 to 116). There are repeated values and one row with no value.',

  // ---- fontes
  'Original (gerador)': 'Original (generator)',
  'Catálogo das tabelas e condições de cada uma': 'Catalog of the tables and the conditions of each',
  'Cópia da tabela C12': 'Copy of the C12 table',
  'Descrição e DOI de cada conjunto': 'Description and DOI of each set',
  'Especificação de leitura aprovada': 'Approved reading specification',
  'Extinção a 1 atm: n-heptano, n-decano e n-dodecano, medida e simulada': 'Extinction at 1 atm: n-heptane, n-decane and n-dodecane, measured and simulated',
  'Ficha dos documentos (aprovada)': 'Study sheet from the documents (approved)',
  'Metadados do portal NASA PSI de várias investigações': 'NASA PSI portal metadata for several investigations',
  'Modelo numérico: chama fria oscilatória (série temporal)': 'Numerical model: oscillatory cool flame (time series)',
  'Original completo (matriz por pesquisador)': 'Complete original (matrix by investigator)',
  'Planilha com as três amostras (derivada)': 'Spreadsheet with the three samples (derived)',
  'Planilha completa: condições, resultados, ignição, câmeras e comentários': 'Complete spreadsheet: conditions, results, ignition, cameras and comments',
  'Pontos digitalizados de 8 figuras de artigos': 'Points digitized from 8 paper figures',
  'Tabela de condições (subconjunto da planilha)': 'Conditions table (subset of the spreadsheet)',
  'Tabela do estudo enviado': 'Table of the uploaded study',
  'Amostra normalizada (derivada)': 'Normalized sample (derived)',
  'Tabela C12 normalizada (derivada)': 'Normalized C12 table (derived)',
  'Derivado de outra fonte; não é fonte primária.': 'Derived from another source; not a primary source.',
  'Usado como referência, não como dado.': 'Used as reference, not as data.',

  // ---- visão geral e comparação de fichas
  '**PSI-69 FLEX:** só a amostra de 34 ensaios; falta `FLEX.csv` (cerca de 274).':
    '**PSI-69 FLEX:** only the 34-test sample; `FLEX.csv` (about 274) is missing.',
  'As medições do PSI-117 são ensaios do CFI (veja PSI-117 × CFI): comparar os dois não é validação independente.':
    'The PSI-117 measurements are CFI tests (see PSI-117 × CFI): comparing the two is not independent validation.',
  'Nenhum combustível ou material em comum: diferenças podem vir do combustível.':
    'No fuel or material in common: differences may come from the fuel.',

  // ---- erros da API
  'Envio não encontrado.': 'Upload not found.',
  'Envio não encontrado: ele pode ter sido descartado.': 'Upload not found: it may have been discarded.',
  'O envio passa de 200 MB.': 'The upload is over 200 MB.',
  'Este envio ainda não foi analisado.': 'This upload has not been analyzed yet.',
  'Especificação sem investigação ou sem tabelas.': 'Specification with no investigation or no tables.',
  'Estes documentos ainda não foram lidos.': 'These documents have not been read yet.',
  'Arquivo maior que 50 MB.': 'File larger than 50 MB.',
  'O banco não tem a ficha dos estudos. Rode a carga de novo.': 'The database has no study sheets. Run the load again.',
  'A Zyria demorou demais para responder. Tente de novo.': 'Zyria took too long to respond. Try again.',
  'Sem conexão com a Zyria. Confira a rede e ZYRIA_BASE_URL.': 'No connection to Zyria. Check the network and ZYRIA_BASE_URL.',
}

// Rótulos conhecidos, também em minúscula: os textos montados pela carga os citam no meio da frase.
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const LOWER: Record<string, string> = {}
for (const [pt, en] of Object.entries({ ...VALUES, ...TEXT })) {
  if (pt.length <= 48) LOWER[lowerFirst(pt)] ??= lowerFirst(en)
}

/** Um rótulo ou valor curto, com a inicial como veio. */
function word(text: string): string {
  return TEXT[text] ?? VALUES[text] ?? LOWER[text] ?? text
}

/** `oxigênio 0.12` → `oxygen 0.12`: o rótulo conhecido mais longo que abre o texto, e o valor depois dele. */
function labelled(text: string): string {
  let best = ''
  for (const pt of Object.keys(LOWER)) {
    if (pt.length > best.length && text.startsWith(`${pt} `)) best = pt
  }
  return best ? `${word(best)} ${word(text.slice(best.length + 1))}` : text
}

const units = (text: string) => text.replaceAll('fração molar', 'mole fraction')

// os grupos de cada padrão existem sempre que ele casa; a tupla dispensa conferir um a um
type Groups = [string, string, string, string]
type Rule = [RegExp, (m: Groups) => string]
const RULES: Rule[] = [
  // alertas
  [
    /^A distância vai até (\S+), contra (\S+) nas outras séries do conjunto: colunas x e y provavelmente trocadas na fonte\. Mantido como está\.$/,
    (m) => `The distance goes up to ${m[1]}, against ${m[2]} in the other series of the set: x and y columns probably swapped in the source. Kept as is.`,
  ],
  [
    /^A planilha atribui estes conjuntos ao mesmo artigo \((.*)\); o CSV dá DOIs diferentes\.$/,
    (m) => `The spreadsheet attributes these sets to the same paper (${m[1]}); the CSV gives different DOIs.`,
  ],
  [/^Ano (\d+) numa campanha de 2014; GMT dia (\S+)\.$/, (m) => `Year ${m[1]} in a 2014 campaign; GMT day ${m[2]}.`],
  [/^Ano (\d+) fora do plausível\.$/, (m) => `Year ${m[1]} is not plausible.`],
  [/^Data é o dia (\d+) do ano, GMT diz (\S+)\.$/, (m) => `The date is day ${m[1]} of the year, GMT says ${m[2]}.`],
  [
    /^O mesmo ensaio \(D0 (\S+) mm\) tem diâmetro de extinção da chama fria diferente no PSI-117 e no CFI\.$/,
    (m) => `The same test (D0 ${m[1]} mm) has a different cool-flame extinction diameter in PSI-117 and in CFI.`,
  ],
  [/^O2 caiu de (\S+)% para (\S+)%: revisar\.$/, (m) => `O2 went from ${m[1]}% to ${m[2]}%: review.`],
  [
    /^XN2 = (\S+) numa coluna de fração molar \(0–1\): parece porcentagem\. A coluna XO3 diz 'Balance'\.$/,
    (m) => `XN2 = ${m[1]} in a mole-fraction column (0–1): looks like a percentage. The XO3 column says 'Balance'.`,
  ],
  [/^(\d+) medições$/, (m) => `${m[1]} measurements`],
  [/^planilha: (.*) \| CSV: (.*)$/, (m) => `spreadsheet: ${m[1]} | CSV: ${m[2]}`],
  [/^(\S+) até (\d[\d.]*)$/, (m) => `${m[1]} up to ${m[2]}`],
  [/^conjunto (\d+)( · .*)?$/, (m) => `set ${m[1]}${m[2] ?? ''}`],
  [/^(\S+) (Medição|Modelo) (D0=\S+)$/, (m) => `${word(m[1])} ${word(m[2])} ${m[3]}`],
  [/^(Chama fria|Chama quente) (\S+ atm)$/, (m) => `${word(m[1])} ${m[2]}`],
  // fontes
  [/^Mesmo conteúdo de (.*)\.$/, (m) => `Same content as ${m[1]}.`],
  [/^Coberto por (.*)\.$/, (m) => `Covered by ${m[1]}.`],
  [/^Aplicada pelo leitor genérico \((\d+) tabela\(s\)\)\.$/, (m) => `Applied by the generic reader (${m[1]} table(s)).`],
  [/^Lida pela especificação (.*)\.$/, (m) => `Read through the specification ${m[1]}.`],
  [/^Metadados cruzados com (.*)\.$/, (m) => `Metadata cross-checked with ${m[1]}.`],
  [/^Formato não reconhecido pelo leitor: (.*)$/, (m) => `Format not recognized by the reader: ${m[1]}`],
  [/^Ficha ilegível: (.*)$/, (m) => `Unreadable study sheet: ${m[1]}`],
  [/^Especificação não aplicável: (.*)$/, (m) => `Specification could not be applied: ${m[1]}`],
  [/^Amostra \((\d+) (?:testes|ensaios)\)$/, (m) => `Sample (${m[1]} tests)`],
  // vínculos entre condições
  [
    /^(.+) e (.+) não variaram de forma independente: o efeito de uma não se separa do da outra nesses testes\.$/,
    (m) => `${word(m[1])} and ${word(m[2])} did not vary independently: the effect of one cannot be separated from the other in these tests.`,
  ],
  [
    /^com .+, só .+ \(\d+ testes\)(?:; com .+, só .+ \(\d+ testes\))*$/,
    (m) =>
      m[0]
        .split('; ')
        .map((part) => {
          const found = /^com (.+), só (.+) \((\d+) testes\)$/.exec(part)
          const [, a, b, n] = (found ?? []) as string[] as Groups
          return found ? `with ${labelled(a)}, only ${labelled(b)} (${n} tests)` : part
        })
        .join('; '),
  ],
  // comparação de fichas
  [/^(.+) \(só (\S+) registra\)$/, (m) => `${word(m[1])} (only ${m[2]} records it)`],
  [/^Mede: (.+)$/, (m) => `Measures: ${word(m[1])}`],
  [/^Ambientes diferentes: (.+) × (.+)\.$/, (m) => `Different environments: ${word(m[1])} × ${word(m[2])}.`],
  [/^Evidências de tipos diferentes: (.+) × (.+)\.$/, (m) => `Different kinds of evidence: ${word(m[1])} × ${word(m[2])}.`],
  [
    /^Mesmo equipamento \((.*), segundo os metadados do portal\): um viés do aparelho afetaria os dois e não apareceria na comparação\.$/,
    (m) => `Same hardware (${m[1]}, according to the portal metadata): an apparatus bias would affect both and would not show in the comparison.`,
  ],
  [
    /^Faixas que se cruzam não garantem testes nas mesmas condições combinadas: (.+) não variaram de forma independente\.$/,
    (m) =>
      `Overlapping ranges do not guarantee tests under the same combined conditions: ${m[1]
        .split('; ')
        .map((pair) => {
          const found = /^(\S+): (.+) × (.+)$/.exec(pair)
          const [, id, a, b] = (found ?? []) as string[] as Groups
          return found ? `${id}: ${word(a)} × ${word(b)}` : pair
        })
        .join('; ')} did not vary independently.`,
  ],
  // visão geral
  [
    /^\*\*PSI-117:\*\* o ReadMe da investigação lista tabelas que não estão em `dados\/`: (.*)\.$/,
    (m) => `**PSI-117:** the investigation ReadMe lists tables that are not in \`dados/\`: ${m[1]}.`,
  ],
  // erros da API
  [/^Investigação (\S+) não existe\.$/, (m) => `Investigation ${m[1]} does not exist.`],
  [/^(\S+) não é um estudo enviado\.$/, (m) => `${m[1]} is not an uploaded study.`],
  [/^Estudo desconhecido: (.*)\.$/, (m) => `Unknown study: ${m[1]}.`],
  [/^Escolha de (\d+) a (\d+) estudos\.$/, (m) => `Choose ${m[1]} to ${m[2]} studies.`],
  [/^(\S+) já foi aprovado: este envio não muda mais\.$/, (m) => `${m[1]} has already been approved: this upload can no longer change.`],
  [
    /^(\S+) não está no sistema: para um estudo novo, use Enviar estudo\.$/,
    (m) => `${m[1]} is not in the system: for a new study, use Upload study.`,
  ],
  [/^Tabela '(.*)' não existe\.$/, (m) => `Table '${m[1]}' does not exist.`],
  [/^Não foi possível ler o arquivo: (.*)$/, (m) => `Could not read the file: ${m[1]}`],
  [/^Página desconhecida: (.*)$/, (m) => `Unknown page: ${m[1]}`],
  [/^Assistente não configurado: preencha (.*) no \.env\.$/, (m) => `Assistant not configured: fill in ${m[1]} in .env.`],
  [/^coluna (\S+)$/, (m) => `column ${m[1]}`],
  // `Oxigênio: 0.12–0.3 fração molar`, `Pressão: PSI-69 1–3 atm × PSI-39 0.5–2 atm`
  [/^([^:]{3,48}): (.*)$/, (m) => (word(m[1]) === m[1] ? m[0] : `${word(m[1])}: ${units(m[2])}`)],
  [/^(.*\d) fração molar$/, (m) => `${m[1]} mole fraction`],
]

const COUNTED = /^(.+) \((\d+)\)$/
/** Um item de lista: `Extinção (32)` ou `Extinção`. */
function item(text: string): string {
  const counted = COUNTED.exec(text)
  const [, name, count] = (counted ?? []) as string[] as Groups
  return counted ? `${word(name)} (${count})` : word(text)
}

/** Listas montadas pela ficha: `Extinção (32), Ruptura da gota (1)` e `Haste | Filme`. */
function list(text: string): string | null {
  // a ficha corta listas longas com reticências
  const more = text.endsWith(' …') ? ' …' : ''
  const body = more ? text.slice(0, -2) : text
  for (const [separator, joiner] of [
    [' | ', ' | '],
    [/, (?![^(]*\))/, ', '],
    ['; ', '; '],
  ] as const) {
    const parts = body.split(separator)
    if (parts.length < 2 || parts.some((p) => p.length > 48)) continue
    const translated = parts.map(item)
    if (translated.some((p, i) => p !== parts[i])) return translated.join(joiner) + more
  }
  const single = item(text)
  return COUNTED.test(text) && single !== text ? single : null
}

const cache = new Map<string, string>()

/** Frases e rótulos (camada de chegada). Valores de domínio soltos passam intactos. */
function sentence(text: string): string {
  const known = TEXT[text]
  if (known) return known
  // só vale procurar por regra no que tem cara de texto: um espaço e alguma letra
  if (text.length < 5 || text.length > 1200 || !text.includes(' ')) return text
  const cached = cache.get(text)
  if (cached !== undefined) return cached
  let out = text
  for (const [pattern, build] of RULES) {
    const match = pattern.exec(text)
    if (match) {
      out = build(match as unknown as Groups)
      break
    }
  }
  if (out === text) out = list(text) ?? text
  cache.set(text, out)
  return out
}

/**
 * Texto do banco no idioma da interface, para exibir: `td(row.desfecho)`. Em português devolve o
 * que recebeu; em inglês troca o que conhece. Nunca use o resultado como chave ou em comparações.
 */
export function td(text: string): string
export function td(text: string | null | undefined): string | null | undefined
export function td(text: string | null | undefined): string | null | undefined {
  if (lang === 'pt' || !text) return text
  // uma célula pode citar uma coluna (o campo de um alerta): sai como o cabeçalho dela
  return VALUES[text] ?? COLUMNS[text] ?? sentence(text)
}

/** Nome de coluna do banco no idioma da interface: cabeçalhos de tabela, eixos e seletores de coluna. */
export function tc(column: string): string {
  return lang === 'pt' ? column : (COLUMNS[column] ?? column)
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') return sentence(value)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (typeof item === 'string' || (typeof item === 'object' && item !== null)) value[i] = walk(item)
    }
    return value
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      const item = record[key]
      if (typeof item === 'string' || (typeof item === 'object' && item !== null)) record[key] = walk(item)
    }
  }
  return value
}

/** Troca, no lugar, as frases e rótulos conhecidos de uma resposta da API. Em português não faz nada. */
export function translateResponse<T>(body: T): T {
  return lang === 'pt' ? body : (walk(body) as T)
}
