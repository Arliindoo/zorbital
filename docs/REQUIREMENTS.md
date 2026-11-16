# Requisitos do produto Zorbital

Levantamento inicial para transformar a visão de
[PRODUCT-VISION.md](PRODUCT-VISION.md) em trabalho implementável. Este documento organiza as
necessidades do produto e propõe prioridades; não indica que os requisitos já estão implementados,
nem decide tecnologias ou modelo científico. O recorte de simulação está em
[SIMULATION.md](SIMULATION.md). A arquitetura existente está em [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Objetivo e resultado esperado

O Zorbital deve permitir que o pesquisador comece pela própria pesquisa, encontre evidências
relacionadas na NASA, avalie relações entre os estudos e explore cenários com modelos científicos
identificados. Um agente especializado deve reduzir o trabalho de preparar e conduzir uma simulação,
com parâmetros rastreáveis e perguntas quando faltar informação essencial. O pesquisador interpreta
as evidências e formula suas conclusões.

O domínio inicial é combustão. A visão futura pode se estender a outras áreas quando existirem
dados, modelos e avaliação apropriados.

## 2. Atores e necessidades

| Ator | Necessidade |
|---|---|
| Pesquisador / cientista / engenheiro | Trazer uma pesquisa própria, encontrar evidências, comparar resultados e investigar cenários |
| Curador da pesquisa | Revisar a leitura dos dados, resolver ambiguidades e manter o histórico de alterações |
| Agente de pesquisa | Entender a pergunta, procurar fontes autorizadas, mostrar evidências e explicar relações e lacunas |
| Agente de simulação | Selecionar ou propor modelos, preparar parâmetros, consultar o usuário sobre dados ausentes, executar ferramentas e organizar a avaliação |
| Motor científico | Calcular resultados para entradas e condições suportadas pelo modelo |
| Administrador / mantenedor | Configurar fontes e ferramentas, acompanhar erros e atualizar o acervo de referência |

O agente de pesquisa e o agente de simulação representam responsabilidades distintas. Podem ser
funções de um mesmo assistente ou componentes separados; essa decisão técnica está aberta.

## 3. Escopo por prioridade

### P0 — indispensável para a primeira jornada de ponta a ponta

1. Criar uma pesquisa própria sem exigir identificador PSI.
2. Importar dados e documentos apoiados, manter os originais e registrar a versão recebida.
3. Interpretar colunas e unidades; expor ambiguidades, valores inválidos e dados ausentes para
   revisão do pesquisador.
4. Guardar a pergunta e informações necessárias para retomar a pesquisa e identificar seus
   experimentos e conjuntos de dados.
5. Encontrar evidência em fontes NASA configuradas e registrar fonte, link, cobertura e
   disponibilidade efetiva dos dados.
6. Relacionar uma pesquisa própria às referências selecionadas com explicações sobre condições
   comparáveis, divergentes e insuficientes.
7. Exibir uma proposta de simulação rastreável: modelo candidato e versão, parâmetros e unidades,
   origem, hipóteses, entradas faltantes, variáveis alteráveis e limitações.
8. Permitir que o usuário revise a configuração antes de executar uma ferramenta científica.
9. Executar pelo menos uma condição suportada e guardar configuração, execução e resultados.
10. Comparar observações e resultados calculados em valores, gráficos e 3D, identificando a natureza
    de cada curva e elemento visual.
11. Permitir que o usuário consulte os resultados com a IA e registre sua própria interpretação.

### P1 — melhora a investigação e a confiança no fluxo

- Comparar cenários em lote e explorar variações em parâmetros suportados.
- Apresentar incertezas, sensibilidade a parâmetros e qualidade de ajuste quando o método calcular
  essas medidas.
- Rastrear modelo, parâmetros, dados, código e ambiente de execução por versão.
- Pesquisar fontes além do catálogo NASA inicial, configuradas com escopo e atribuição explícitos.
- Exportar dados, configuração e resultados da pesquisa em formato documentado.
- Suportar múltiplos projetos e retomar execuções interrompidas.

### P2 — ampliação depois de demonstrar o primeiro domínio

- Adicionar famílias de modelos, fenômenos e geometrias, cada uma com critérios próprios de
  compatibilidade e avaliação.
- Colaboração entre pesquisadores, permissões e compartilhamento deliberado de projetos.
- Descoberta mais ampla em portais e repositórios científicos externos.
- Execuções de alto custo e filas computacionais, se a seleção de modelos assim exigir.

## 4. Requisitos funcionais

### RF-01 — Projeto de pesquisa

O sistema deve criar uma pesquisa com identificador interno próprio, título ou descrição, pergunta
de pesquisa, data de criação e estado. Ela pode referenciar zero ou mais itens NASA, sem depender
deles para existir.

**Aceitação:** criar e reabrir uma pesquisa sem PSI; ver pergunta, experimentos e fontes vinculados;
editar informações sem perder versões anteriores de conjuntos de dados.

### RF-02 — Importação e versões de dados

O sistema deve receber os formatos explicitamente suportados, preservar o arquivo original,
classificar arquivos e produzir um perfil de tabelas, folhas, colunas, unidades aparentes e linhas
de amostra. Nova importação de dados alterados deve resultar em nova versão identificável.

**Aceitação:** cada valor transformado pode ser rastreado ao arquivo e posição de origem; rejeições
e arquivos não suportados explicam o motivo; importar dados próprios não os inclui automaticamente
no acervo compartilhado ou na seed pública.

### RF-03 — Interpretação e revisão

O agente pode propor significado, tipo, unidade, natureza, valores especiais e mapeamento das
colunas. A interface deve separar proposta, inferência, revisão e interpretação adotada. O
pesquisador pode confirmar, editar ou rejeitar cada mapeamento.

**Aceitação:** salvar uma revisão altera a especificação aplicada à versão escolhida; manter
autor/data da revisão e valores originais; alterações não reescrevem silenciosamente o arquivo-fonte.

### RF-04 — Descoberta de evidências

O usuário deve pesquisar fontes configuradas usando pergunta e características do experimento.
Para cada resultado, o sistema apresenta metadados de busca, justificativa de pertinência e quais
artigos, metadados ou arquivos de dados estão realmente acessíveis.

**Aceitação:** distinguir busca no catálogo local de consulta externa; registrar fonte, horário ou
versão e consulta usada; exibir falha, cobertura parcial e busca sem resultados como estados
diferentes; nunca apresentar ausência de resultado como prova de que o estudo não existe.

### RF-05 — Seleção e comparação de evidências

O pesquisador deve selecionar referências para a pesquisa. O sistema compara somente grandezas
com semântica e unidades mapeadas, e explicita condições, diferenças, dados ausentes e relações
entre fontes que afetam a leitura.

**Aceitação:** cada relação mostrada informa os dados e método que a sustentam; similaridade textual,
faixa sobreposta e correlação estatística não são tratadas como sinônimos; inferência causal não é
declarada sem método e evidência apropriados.

### RF-06 — Plano de simulação proposto pelo agente

O agente deve receber uma pergunta sobre um experimento e propor um plano que inclua modelo ou
modelos candidatos com referência e versão; adequação à pergunta; parâmetros obrigatórios, valores,
unidades e origem; estimativas, defaults, hipóteses, conflitos e dados ausentes; entradas que podem
ser alteradas e as que ficam constantes; saídas esperadas, domínio aplicável e limitações; e a
ferramenta necessária para executar.

**Aceitação:** apresentar erros de unidade e incompatibilidades; distinguir inferência do agente de
valor medido; perguntar sobre lacunas essenciais; permitir revisar o plano antes da execução.

### RF-07 — Execução de cenário

O sistema deve executar uma configuração revisada por uma ferramenta científica com contrato
identificado. Deve guardar modelo, versão, configuração, entradas efetivamente usadas, saída, estado
e erros. Alterar uma entrada deve chegar ao cálculo, não apenas à camada gráfica.

**Aceitação:** a execução identifica se o mesmo modelo e configuração foram usados; execução
incompleta ou malsucedida não aparece como previsão válida; cenários incompatíveis explicam o motivo.

### RF-08 — Avaliação do modelo

Quando existirem observações adequadas, o sistema deve apoiar comparação entre observação e
previsão. Registrar quais dados foram usados para ajuste e quais foram reservados para avaliação;
apresentar métricas e incerteza quando disponíveis e adequadas ao método.

**Aceitação:** pontos usados para ajuste não são apresentados implicitamente como evidência
independente; limitações da avaliação permanecem visíveis com os resultados.

### RF-09 — Gráficos e visualização 3D

O sistema deve representar a execução que recebeu, partilhando seus valores e unidades com tabelas
e gráficos. A interface deve distinguir observações, séries calculadas, reconstruções, estimativas,
incerteza e ilustração.

**Aceitação:** selecionar um ponto temporal liga os painéis ao mesmo estado; unidades e escala são
legíveis; progresso visual não é apresentado como tempo físico medido; valores não são fabricados
para preencher lacunas do renderizador.

### RF-10 — Assistência durante a investigação

O assistente deve responder usando a pesquisa, evidências selecionadas, estados da simulação e
consultas permitidas. Deve mostrar fontes próximas às afirmações factuais, separar resultado,
interpretação e hipótese, propor perguntas seguintes e informar quando não há base suficiente.

**Aceitação:** afirmações numéricas remetem a resultados identificáveis; resposta sobre fontes
externas inclui sua proveniência; hipótese gerada pela IA é rotulada como hipótese; o pesquisador
pode guardar, editar ou descartar a interpretação.

### RF-11 — Registro de conclusão

O pesquisador deve registrar uma conclusão com texto próprio e ligações para observações,
referências, comparações e cenários que a informam. Revisões subsequentes mantêm histórico.

**Aceitação:** abrir a conclusão leva às evidências e execuções utilizadas; uma alteração da fonte
ou configuração permite identificar a versão citada.

### RF-12 — Isolamento e compartilhamento

Pesquisas e dados do usuário permanecem no escopo de acesso definido pelo produto. Envio, análise
por IA e aprovação de importação não significam publicação nem inclusão no acervo público.

**Aceitação:** o produto declara para onde conteúdo é enviado, quais serviços externos o recebem,
quem pode acessar e quando dados são compartilhados ou excluídos. Hospedagem e contas ainda precisam
ser definidas.

## 5. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 — Procedência | Dados, interpretações, referências, parâmetros, execuções e resultados têm relações rastreáveis |
| RNF-02 — Separação de evidência | Observação, previsão, estimativa, reconstrução, hipótese e incerteza permanecem distinguíveis |
| RNF-03 — Reprodutibilidade | Identificar versões de dados, especificação, modelo e parâmetros suficientes para explicar ou reproduzir uma execução |
| RNF-04 — Segurança | Tratar arquivos e documentos como entrada não confiável; limitar extração, caminhos, tamanho e conteúdo executável |
| RNF-05 — Controle de ferramentas | A IA opera por ferramentas e permissões explícitas, sem acesso irrestrito a arquivos, rede, SQL ou execução de código |
| RNF-06 — Recuperação | Importações e execuções incompletas guardam estado recuperável e não substituem resultados válidos silenciosamente |
| RNF-07 — Clareza | O pesquisador entende o que foi medido, inferido, o que falta e por que o cálculo pode ou não prosseguir |
| RNF-08 — Desempenho | Mostrar progresso de cálculos demorados; limites precisam ser medidos após selecionar o motor |
| RNF-09 — Acesso | Oferecer texto e dados para informações essenciais da cena 3D |
| RNF-10 — Custo | Mostrar custos relevantes de busca, IA e execução quando estimáveis |
| RNF-11 — Privacidade | Minimizar envio de dados a serviços externos e explicitar acesso conforme a implantação decidida |

## 6. Requisitos científicos e limites do agente

1. O agente pode pesquisar, recomendar, organizar parâmetros e conduzir ferramentas registradas.
2. Resultados numéricos científicos vêm de uma fonte ou execução identificada, não de texto da IA.
3. Um modelo criado, adaptado ou parametrizado com ajuda de IA precisa de referências, versão,
   revisão técnica e protocolo de avaliação antes de suas saídas serem tratadas como previsões.
4. Uma execução sem erro pode continuar cientificamente inadequada; sucesso computacional e
   avaliação física são estados diferentes.
5. O modelo expõe seu domínio e condições não contempladas. Extrapolação permanece identificada.
6. Comparações com NASA verificam dependência e reutilização de dados para evitar chamar uma
   concordância de validação independente quando as fontes não forem independentes.
7. O pesquisador formula a conclusão; o agente aponta evidências, hipóteses, incertezas,
   explicações alternativas e próximos experimentos possíveis.

## 7. Dados, registros e estados

Entidades conceituais necessárias:

- **Projeto de pesquisa:** pergunta, metadados, permissões e histórico.
- **Experimento:** protocolo, materiais, geometria, condições e resultados medidos.
- **Versão de conjunto de dados:** originais, perfil, transformações aprovadas e procedência.
- **Referência externa:** identificador, fonte, consulta, acesso a texto/dados e vínculo ao projeto.
- **Interpretação:** proposta, valor adotado, evidência, autor e revisão.
- **Plano de simulação:** pergunta, modelos candidatos, configuração, fontes dos parâmetros e aceite.
- **Execução:** estado, ambiente, modelo/versão, configuração usada e erro.
- **Resultado:** saída tipada com unidade, natureza, incerteza quando disponível e execução de origem.
- **Conclusão:** interpretação humana versionada e ligações às evidências utilizadas.

São entidades de domínio, não uma proposta fechada de esquema SQL. Estados mínimos de execução:
rascunho, precisa de dados, pronto para revisão, autorizado, executando, concluído, falhou e
incompatível. Estados de disponibilidade de referências externas também devem ser explícitos.

## 8. Critérios de aceitação ponta a ponta

### CA-01 — Pesquisa própria e referência

Um pesquisador cria projeto sem PSI, importa dados, revisa unidades e ambiguidades e retoma o
projeto com originais e interpretações preservados. Busca trabalhos NASA, seleciona uma referência
e abre sua proveniência e disponibilidade dos dados.

### CA-02 — Preparação da simulação

O pesquisador pede para explorar uma mudança de condição. O agente propõe modelo, versão,
parâmetros com fontes, hipóteses e dados faltantes. Corrigir ou substituir um parâmetro altera a
configuração revisada; nenhum valor é silenciosamente tratado como medição.

### CA-03 — Execução e comparação

Uma configuração suportada executa no motor científico. O sistema guarda a execução. Gráficos e
3D mostram os resultados dela e permitem comparar com a referência. Uma configuração não suportada
explica o impedimento em vez de mostrar uma animação de previsão.

### CA-04 — Conclusão apoiada

O usuário pergunta o que mudou. A IA usa resultados identificados, compara condições, explicita
limitações e identifica explicações não demonstradas como hipóteses. O pesquisador registra sua
conclusão ligada às fontes e à execução.

### CA-05 — Independência e ciclo de vida dos dados

Importar dados para uma pesquisa não altera o acervo de demonstração. O usuário sabe quais dados
foram enviados a serviços externos e pode localizar as fontes de cada resultado.

## 9. Decisões ainda abertas

Antes de implementar uma simulação funcional, definir:

1. Primeiro fenômeno, geometria e pergunta científica.
2. Se a primeira entrega suporta nova pressão, nova gravidade ou outro parâmetro. Gravidade não
   deve virar controle visual sem estar representada no modelo escolhido.
3. Modelos candidatos, referências, licença, ferramenta de execução e recursos necessários.
4. Entradas obrigatórias, variáveis previstas e condições não cobertas.
5. Dados independentes para parametrização e avaliação, e métricas apropriadas.
6. O que o agente pode adaptar ou escrever, que revisão isso exige e quando pode executar.
7. Persistência local ou hospedada, contas, compartilhamento, retenção e exclusão.
8. Fontes NASA consultáveis, termos de acesso, formatos e comportamento diante de indisponibilidade.
9. Como registrar custo, latência e limites de armazenamento e execução.

Essas decisões dependem da seleção e avaliação de modelos. O agente pode reduzir o esforço de
configuração, mas não elimina a necessidade de definir o fenômeno e verificar a adequação científica.

## 10. Próximas etapas propostas

| Ordem | Atividade | Resultado |
|---|---|---|
| 1 | Escolher uma pergunta científica e mapear dados próprios e do acervo NASA relevante | Caso de uso e variáveis/condições |
| 2 | Investigar opções NASA de descoberta e acesso | Fontes, cobertura, acesso e limitações |
| 3 | Identificar modelos candidatos | Requisitos, evidência disponível e ferramentas |
| 4 | Definir avaliação | Métricas, dados independentes e limites declarados |
| 5 | Definir contratos entre pesquisa, agente, motor e resultados | Esquema conceitual e interfaces |
| 6 | Implementar uma fatia vertical | Importar, preparar, revisar, executar, comparar e visualizar um cenário suportado |
| 7 | Avaliar com pesquisadores | Utilidade, clareza e limitações percebidas |

Esta sequência não é cronograma. A primeira fatia vertical depende das decisões abertas acima.
