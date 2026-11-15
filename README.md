# Zorbital — combustão em microgravidade

Dashboard para explorar três investigações da NASA sobre chamas em microgravidade (desafio
*Flame in Freefall*, NASA Space Apps 2026), comparar condições e pedir uma interpretação à IA.

| Investigação | Categoria | O que responde |
|---|---|---|
| PSI-69 FLEX | Gota de combustível líquido, ISS | Em que condições a chama visível se extinguiu |
| PSI-25 BASS-II | Material sólido, ISS | Que materiais, O2 e ventilação foram testados e o que se mediu |
| PSI-117 | Medição × modelo, solo | Onde o diâmetro de extinção do modelo difere do medido |
| PSI-39 CFI | Gota de n-dodecano · chama fria, ISS | Como pressão, hélio e combustível mudam a extinção das chamas quente e fria |
| PSI-142 | Chama em contrafluxo, solo | Em que estiramento as chamas frias e quentes de n-alcanos se extinguem |

A página **PSI-117 × CFI** é a única que compara investigações: diâmetro de extinção de gotas de
n-dodecano por pressão. Ela mostra também que parte das "medições" do PSI-117 são ensaios do próprio
CFI (identificados pelo D0 e pelo diâmetro da chama quente), então não é uma validação independente.

Cada investigação tem duas vistas: o **Painel** (dados e gráficos) e a **Simulação** (o experimento
no seu ambiente, em 3D). A troca fica logo abaixo do título e no endereço (`?vista=simulacao`).

## Simulação

A vista de simulação desce por escalas até o experimento e reproduz o item escolhido a partir dos
valores da fonte:

| Estudo | Cenas | O que é reproduzido |
|---|---|---|
| FLEX, CFI | ISS em órbita → laboratório Destiny e rack CIR → câmara de combustão | A gota de cada ensaio, de D0 ao diâmetro de extinção (chama quente e, no CFI, chama fria) |
| BASS-II | ISS em órbita → Destiny e bancada MSG → duto de escoamento | A amostra com a forma e as medidas da fonte, e as leituras de gás do começo ao fim |
| PSI-142 | Terra (Princeton) → bancada óptica → zona de reação entre os bocais | Cada série: perfis desenhados no próprio vão, ou a curva de limite de extinção percorrida ponto a ponto |
| PSI-117 | Terra → domínio do modelo | A gota medida e a do modelo lado a lado, com a faixa de incerteza; e a série temporal do modelo |

Na cena: arrastar orbita a câmera, clicar e rolar aproxima, os marcadores levam à cena seguinte,
`←` `→` trocam de ensaio, `espaço` toca e pausa, `F` abre em tela cheia. Os filtros do painel valem
também aqui: a faixa de ensaios no rodapé mostra só o que está no filtro.

**O que é dado e o que é ilustração.** A simulação é uma reconstrução, não um vídeo do experimento.
Vêm da fonte os valores de cada ensaio (diâmetros, tempos, taxas, composição do gás, medidas da
amostra, pontos digitalizados). Entre dois valores medidos de uma gota, a curva é a lei do d² (o
quadrado do diâmetro cai em linha reta) — uma reconstrução que passa pelos extremos medidos. São
ilustrativos a posição e o brilho das chamas, o escoamento dos traçadores, a coreografia de agulhas
e ignitores e as maquetes (ISS, Destiny, racks, queimador), que são esquemáticas. Na tela, valores
reconstruídos ou estimados aparecem sublinhados em tracejado, e o botão ⓘ lista, ensaio a ensaio, o
que é cada coisa. Quando falta o dado para reconstruir, o ensaio aparece na faixa como "sem
reconstrução", com o motivo; nada é inventado para preencher.

## Como rodar

Pré-requisitos: [uv](https://docs.astral.sh/uv/) (ele instala o Python 3.12 e as dependências
sozinho) e Node.js 22 ou mais novo.

O painel tem duas partes: a **API** em Python (FastAPI, em `src/spaceapps/api/`), que lê o banco e
roda o assistente, e o **front-end** em React + Vite + TypeScript (em `frontend/`), que desenha a
tela no navegador.

Desenvolvimento, em dois terminais:

```bash
uv sync && cp .env.example .env               # depois preencha ZYRIA_BASE_URL e ZYRIA_API_KEY
uv run uvicorn spaceapps.api.app:app --reload # API em http://localhost:8000 (docs em /api/docs)
```

```bash
cd frontend && npm install && npm run dev     # painel em http://localhost:5173, com recarga instantânea
```

O Vite repassa `/api` para a porta 8000, então o navegador só fala com uma origem.

Produção (um processo só, que serve a API e o front-end já compilado):

```bash
npm --prefix frontend ci && npm --prefix frontend run build   # gera frontend/dist
uv run spaceapps-serve                                       # http://localhost:8000
```

`SPACEAPPS_HOST` e `SPACEAPPS_PORT` mudam o endereço (o padrão só aceita conexões desta máquina).

Quem clona o repositório não precisa baixar tabela nenhuma: ao subir, a API monta o banco a partir
da **seed** versionada em `seed/`. Sem a chave da Zyria, tudo funciona menos o assistente.

Quem tem os arquivos originais em `dados/` e muda algo neles roda a carga, que refaz o banco e a
seed, e depois faz commit de `seed/`:

```bash
uv run spaceapps-build           # lê dados/, gera data/zorbital.duckdb e regrava seed/
uv run spaceapps-seed            # (opcional) refaz o banco só a partir da seed
```

Outros comandos:

```bash
uv run pytest                # testes da carga, da API e do assistente (com uma pasta dados/ sintética)
uv run ruff check .          # lint do Python
uv run ruff format .         # formatação do Python
npm --prefix frontend test           # testes do front-end (Vitest)
npm --prefix frontend run typecheck  # TypeScript
npm --prefix frontend run lint       # lint do front-end (oxlint)
```

## Como os dados fluem

```
dados/  (arquivos originais do portal NASA PSI, nunca alterados, fora do git)
   │  uv run spaceapps-build
   ├──────────────► seed/  (tabelas normalizadas em Parquet, ~210 KB, no git)
   ▼                  │  primeira abertura sem banco, ou uv run spaceapps-seed
data/zorbital.duckdb ◄┘  (derivado: pode ser apagado e refeito, fora do git)
   │
   ▼
API FastAPI (leitura; só o envio aprovado escreve) ──JSON──► front-end React (filtros, gráficos e tabelas no navegador)
```

A seed guarda as tabelas do banco já normalizadas, com os tipos preservados. As visões (`v_*`) não
vão nela: são recriadas pelo código, para nunca divergirem da versão em uso. A exportação é
determinística e só regrava os arquivos que mudaram, então o git só registra mudança quando os
dados mudam. O banco montado da seed é idêntico ao montado de `dados/`.

Os **arquivos continuam sendo a fonte**. O banco é um derivado deles e existe por quatro motivos:

- **Duplicatas.** Cada arquivo é identificado pelo hash; cópias exatas e cópias derivadas não são
  carregadas duas vezes. Quando há original e amostra da mesma investigação, o original vence.
- **Tipos.** Datas viram datas, números viram números. Células com texto em coluna numérica
  (`OR`, `>500`, `none`) ficam vazias, e o texto original vai para a tabela `alertas`.
- **Categorias.** A coluna de material do BASS-II, texto livre, vira categoria, geometria,
  espessura, largura, diâmetro e cor — sem completar o que não está escrito.
- **Separação.** Cada investigação tem sua tabela; medição e modelo do PSI-117 nunca se misturam.

### Tabelas

| Tabela | Conteúdo |
|---|---|
| `investigacoes` | Uma linha por investigação: pergunta, cautelas, links NASA e fonte carregada |
| `flex_ensaios` | Um ensaio FLEX por linha |
| `bass_ensaios` | Um teste BASS-II por linha, com o texto original e as categorias extraídas |
| `psi117_extincao` | Um ponto por linha: pressão, diâmetro, tipo de chama, série e natureza (medido, simulado, incerteza) |
| `psi117_extincao_1atm` | Extinção a 1 atm de n-heptano, n-decano e n-dodecano por D0, medida e simulada |
| `psi117_series_modelo` | Séries temporais do modelo numérico (chamas frias estável e oscilatória) |
| `psi117_tabelas` | O ReadMe do PSI-117: cada tabela, suas condições e se está em `dados/` |
| `cfi_ensaios`, `cfi_cameras` | Um ensaio do CFI por linha: condições, resultados, ignição, comentário; e as câmeras |
| `psi142_conjuntos`, `psi142_pontos` | Os 8 conjuntos digitalizados do PSI-142 (artigo, figura, DOI) e seus pontos (x, y) |
| `psi117_cfi_correspondencia` | Quais medições do PSI-117 são ensaios do CFI, e onde os valores divergem |
| `ficha`, `ficha_vinculos` | Ficha de cada estudo (combustível, amostra, condições, medições, o que variou e o que ficou fixo) e as condições que não variaram de forma independente |
| `metadados`, `publicacoes` | Objetivo, hipótese, abordagem, equipamento e publicações de cada investigação, do portal NASA PSI |
| `alertas` | Achados de qualidade: valor original, tipo e explicação |
| `fontes` | Todos os arquivos de `dados/`, com hash, status (carregado, duplicata, derivado) e motivo |
| `v_psi117_comparacao` | Medido e modelo lado a lado por pressão, com a faixa de incerteza |
| `v_extincao_c12_comparacao` | PSI-117 e CFI lado a lado por pressão e tipo de chama |
| `v_bass_por_material`, `v_flex_por_desfecho`, `v_cfi_por_pressao`, `v_alertas_resumo` | Resumos prontos |

### Adicionar um arquivo novo

1. Coloque o arquivo em `dados/` e rode `uv run spaceapps-build`. Os nomes do portal NASA PSI, com
   prefixo (`PSI-117_Analyzed Data_…`, `PSI-39_Experimental table_…`), são reconhecidos sem renomear.
2. Se ele aparecer como **Não reconhecido** na Visão geral, registre o nome em
   [catalog.py](src/spaceapps/ingest/catalog.py) e, se for um formato novo, escreva o leitor em
   `src/spaceapps/ingest/`.

As tabelas completas do FLEX (cerca de 274 ensaios; aqui há uma amostra de 34) e os modelos do
PSI-117 saem do gerador que veio no pacote:

```bash
cd dados && python Zorbital/scripts/gerar_dados_zorbital.py Zorbital_dados_completos
cd .. && uv run spaceapps-build
```

### Ficha dos estudos

Cada estudo ganha uma ficha calculada dos dados na carga, sem IA
([ficha.py](src/spaceapps/ingest/ficha.py)). Ela aparece no topo da página do estudo, gera as etiquetas
dos cartões em **Estudos** e alimenta os filtros por faixa de O₂, pressão e formato da amostra.

- Um vocabulário comum (`ATRIBUTOS`) põe tudo na mesma unidade: O₂ como fração, pressão em atm,
  tamanhos em mm. Unidades que o código não sabe converter ficam como estão e não entram nos filtros.
- Nas tabelas do catálogo, `PAPEIS` diz o que cada coluna representa. Estudos enviados trazem o
  `atributo` de cada coluna na especificação, conferido na revisão.
- Cada item diz de onde saiu: a coluna (`flex_ensaios.pressao_mmhg ÷ 760`) ou o documento.
- **Condições que não variaram de forma independente:** quando um nível de uma condição só aparece
  com um nível de outra (no FLEX, pressão alta só com um nível de O₂), a diferença nesses testes não
  pode ser atribuída a uma delas sozinha. A composição do gás (N₂ como resto) e as características
  da própria amostra não entram nessa lista.

### Metadados do portal

O `dados/metadados/DadosPsi.tar.gz` (download em lote do portal NASA PSI, formato ISA-Tab, um zip por
investigação) entra pelo [metadados.py](src/spaceapps/ingest/metadados.py) nas tabelas `metadados`
(objetivo, hipótese, abordagem, equipamento, plataforma, período, palavras-chave) e `publicacoes`. É
lido na memória, sem extrair nada, e sem IA: os campos são fixos. Nome, e-mail e contato dos
pesquisadores ficam de fora.

Aparece em "Objetivo, equipamento e publicações" na página de cada estudo, entra na busca e nas fichas
lado a lado (dois estudos no mesmo aparelho geram um aviso) e é devolvido pela ferramenta `cautelas`.

### Ficha a partir dos documentos

O que só está escrito nos documentos (sensores, condições mantidas fixas, objetivo) entra pela
[ficha_docs.py](src/spaceapps/studies/ficha_docs.py):

1. **A IA propõe** um bloco `ficha`. No envio, ele vem na mesma chamada da especificação; para estudos
   do catálogo, use **Dados → Adicionar documentos**, que lê só a ficha. Cada item cita arquivo,
   página e um trecho copiado.
2. **O código confere o trecho** no texto daquela página (com uma página de folga, sem diferenciar
   acentos, maiúsculas, pontuação e quebras). O que confere nasce marcado em *Entra na ficha*; o que
   não confere nasce desmarcado.
3. **A pessoa revisa:** edita, apaga, marca ou desmarca. Só o que está marcado é gravado: em
   `estudo.json` → `ficha` (envio) ou em `dados/<PSI>/ficha.json`, com os documentos em
   `dados/<PSI>/documentos/` (catálogo).
4. **A carga lê sem IA.** Os itens entram na `ficha` com a origem *documento* e a citação. Os dados
   valem mais que o documento: se a faixa escrita não cobre a dos dados, a ficha mostra os dois e
   registra o alerta `ficha_divergente`; as comparações usam a faixa dos dados.

### Fichas lado a lado

A página **Comparações → Fichas lado a lado** ([fichas.py](src/spaceapps/fichas.py)) compara de 2 a 4
estudos antes de qualquer resultado: as faixas de O₂, pressão, hélio e tamanho da amostra, na mesma
unidade, com a faixa comum sombreada; o que cada um mede; e um veredito por par.

- **Grandezas medidas** (`GRANDEZAS` em [ficha.py](src/spaceapps/ingest/ficha.py)): diâmetro de
  extinção, taxa de queima, tempo de queima, taxa de estiramento, temperatura da chama, gases e emissão da
  chama. É o que diz que dois estudos mediram a mesma coisa. Nos envios, a IA propõe a grandeza de cada
  coluna de resultado e a revisão confirma.
- **Vereditos:** *Janela comparável*, *Combustíveis diferentes*, *Condições sem sobreposição*, *Sem
  condição numérica em comum* e *Nada medido em comum*.
- **Avisos que acompanham o veredito:** ambiente e tipo de evidência diferentes, a relação PSI-117 × CFI
  (não é validação independente) e os vínculos de cada estudo entre as condições cujas faixas se cruzam:
  faixa comum não quer dizer que a mesma combinação foi testada.
- O assistente da página tem a ferramenta `comparar_fichas`, presa aos estudos escolhidos na tela.

## Enviar um estudo

A página **Enviar estudo** recebe as tabelas (.csv, .xlsx) e ao menos um documento (.pdf, .md, .txt),
soltos ou em .zip, .rar ou .tar.gz (o .rar usa o `7z` instalado na máquina).

1. **Receber:** os arquivos vão para `data/uploads/<envio>/`, fora do git. Compactados são abertos com
   proteção contra caminhos que saem da pasta, links, *zip bombs* e excesso de tamanho.
2. **Analisar:** a IA (`ZYRIA_MODEL_ANALISE`, padrão `anthropic/claude-sonnet-5.5`) recebe o perfil
   das tabelas (não as planilhas inteiras) e o texto dos documentos com o número da página, e propõe
   uma **especificação de leitura**: o que cada coluna é, a unidade, valores especiais, linhas a
   excluir, cautelas e, para cada interpretação, de onde ela saiu (documento e página, cabeçalho ou
   inferência). O custo estimado aparece antes da chamada.
3. **Revisar:** tudo é editável. As interpretações inferidas pela IA precisam ser confirmadas uma a
   uma; até lá, e enquanto a validação apontar problemas, não dá para aprovar.
4. **Aprovar:** os arquivos vão para `dados/<PSI>/`, junto com `estudo.json` (a especificação
   aprovada), e a carga e a seed são refeitas.

**A IA não grava dados.** Quem lê as tabelas é o leitor genérico (`ingest/generic.py`), que aplica a
especificação de forma determinística: toda carga dá o mesmo resultado, sem chamar a IA, e cada
linha guarda o arquivo, a aba e a linha de origem. O estudo aparece em **Estudos**, com a
seção "Dados aferidos" mostrando a natureza (medido, simulado, condição…) e a evidência de cada
coluna.

Layouts lidos nesta versão: tabela simples e várias fontes com as mesmas colunas, empilhadas. Blocos
lado a lado e abas ligadas por chave ainda pedem leitor manual. As comparações sugeridas pela IA
ficam gravadas, mas ainda não são verificadas por regras de compatibilidade.

## Estrutura

| Caminho | O que é |
|---|---|
| `src/spaceapps/api/` | API FastAPI: dados de cada página (`pages.py`), estudos, fichas e busca (`studies.py`), envio de estudos e documentos (`uploads.py`), assistente em streaming (`chat.py`) e o servidor de produção (`app.py`) |
| `src/spaceapps/ingest/` | Leitura de cada fonte, catálogo de arquivos, leitor genérico e montagem do banco |
| `src/spaceapps/studies/` | Envio de estudos: extração segura, perfil, documentos, proposta da IA e aprovação |
| `src/spaceapps/db.py` | Leitura do banco (só leitura) |
| `src/spaceapps/assistant/` | Assistente: estado da tela, ferramentas por grupo, cliente Zyria e o laço |
| `frontend/src/pages/` | Uma página por investigação, a Visão geral, Estudos (todos, com busca) e a página genérica dos enviados, as fichas lado a lado, a comparação PSI-117 × CFI, o envio de estudos e de documentos, o explorador livre e a galeria de gráficos |
| `frontend/src/charts/` | Gráficos em SVG feitos à mão (`XYChart`, Sankey, 3D isométrico, ridgeline…), as séries de cada página (`build.ts`, funções puras) e as cores fixas por categoria (`colors.ts`) |
| `frontend/src/styles/` | Sistema visual: `tokens.css` (cores, tipografia, movimento), estrutura, peças e gráficos. Tema escuro único, sem sombras |
| `frontend/src/sim/` | Simulação em WebGL2: motor de desenho em linhas (`engine/`), cenas (`scenes/`), reconstrução da queima (`replay/`), a ligação de cada estudo aos dados (`studies/`) e o HUD (`hud/`) |
| `frontend/src/fx/` | Efeitos de entrada: contagem de números, texto que decifra, holofote na borda dos painéis |
| `frontend/src/icons/` | Ícones Solar gerados por `scripts/icons.mjs` (via `better-icons`) |
| `frontend/src/components/` | Peças de tela: layout com navegação, filtros, tabela, cabeçalho de investigação com a ficha do estudo (`Ficha.tsx`), tabela editável e revisão da ficha (`EditTable.tsx`, `FichaReview.tsx`) e as peças do envio (`upload.tsx`) |
| `frontend/src/assistant/` | Painel do assistente e o estado da tela que cada página entrega a ele |
| `tests/` | Pasta `dados/` sintética, testes da carga, da API e do assistente |

### Como o front-end conversa com a API

- Cada página faz **uma** consulta (`GET /api/pages/<página>`) e recebe as tabelas com o tipo de cada
  coluna. Filtros, gráficos e contagens rodam no navegador: mexer num filtro não vai ao servidor.
- As consultas passam pelo TanStack Query, com cache: voltar a uma página não baixa os dados de novo.
  O banco só muda quando um envio é aprovado, e a aprovação invalida o cache: o que já veio não fica velho.
- A ficha, os vínculos e os metadados do portal vêm junto com a investigação de cada página; a lista de
  **Estudos** traz o índice de busca de cada estudo, e a busca e os filtros por faixa rodam no navegador.
- As fichas lado a lado são calculadas no servidor (`GET /api/fichas/comparar?ids=…`), uma consulta por
  combinação de estudos.
- O envio guarda o estado na pasta do envio (`data/uploads/<envio>/`): o navegador lembra só o
  identificador, e cada edição da revisão é gravada lá (`PUT /api/envios/<envio>/especificacao`), que
  devolve a conferência e a prévia. Recarregar a página continua de onde parou.
- Os filtros de cada página ficam guardados na aba (sessionStorage): sair e voltar mantém o que estava.
- Os gráficos são SVG desenhado pelo próprio React (sem biblioteca de gráficos); cada página é carregada sob demanda.
- O PSI-142 tem milhares de pontos: a página baixa um conjunto por vez (`/api/pages/psi142/<id>`).
- A simulação é desenhada em WebGL2, sem biblioteca 3D, e só é baixada quando alguém abre a vista.
  A geometria vai para a GPU uma vez (segmentos instanciados, uma chamada de desenho por lote); a
  Terra e as chamas são calculadas no fragmento; as partículas não têm estado na CPU. O laço para com
  a aba oculta ou a cena fora da tela, e a resolução interna se ajusta ao tempo de quadro.

## Assistente

A barra de comando no rodapé (⌘K) abre o agente, que explica o que está na tela. Ao enviar a pergunta,
a própria página vira o palco: os blocos lidos são destacados e o trabalho passa por cinco etapas,
todas tiradas do fluxo real do servidor:

1. **Ler a tela** — a pergunta segue com o estado da página (filtros, descrição dos gráficos e as
   linhas filtradas).
2. **Estudos** — antes de qualquer consulta aos dados, o servidor lê a ficha das investigações
   envolvidas (a da página, as duas da comparação, ou todas na Visão geral) e a coloca no contexto do
   modelo: a pergunta que cada estudo responde, o tipo de evidência, a fonte carregada e as cautelas.
   Idas posteriores à ficha (`cautelas`, `alertas`, `fonte_dos_dados`, catálogo) também aparecem aqui.
3. **Consultar** — cada consulta aos dados feita pelas ferramentas da página.
4. **Compor** — a resposta chega em streaming.
5. **Concluído** — recibo com custo em ZYT, estudos, consultas e tempo.

A pergunta vai para `POST /api/assistant/chat` com o estado da tela e o histórico, e a resposta volta
em NDJSON (`studies`, `tool`, `text`, `done`, `error`). O servidor não guarda conversa: o histórico
fica na aba do navegador, uma conversa por página, e some ao fechá-la. O provedor é a **Zyria** (API compatível
com a da OpenAI, documentação em `dados/zyria/`); configure `ZYRIA_BASE_URL` e `ZYRIA_API_KEY` no
`.env`. O consumo aparece nos relatórios da Zyria com a etiqueta `zorbital-dashboard`.

O modelo padrão é `anthropic/claude-sonnet-5.5` (troque em `ZYRIA_MODEL`). Ele precisa aceitar
ferramentas: na primeira pergunta o app confere o catálogo da credencial (`GET /models`) e, se o
modelo não servir, diz quais servem antes de gastar ZYT.

O escopo é limitado de duas formas: o prompt manda recusar assuntos fora do painel, e — o que vale
mais — **cada página só entrega ao modelo os grupos de ferramentas dela**. As regras de escopo
estão no código das ferramentas, não só no prompt.

| Grupo | Ferramentas | Para quê |
|---|---|---|
| `tela` | `tela_resumo`, `tela_linhas`, `tela_estatisticas` | Filtros, gráficos e as linhas filtradas na tela |
| `flex` | `flex_ensaio`, `flex_agrupar` | Um ensaio FLEX com seus alertas; contagens e medidas por grupo |
| `bass` | `bass_teste`, `bass_agrupar` | Idem para o BASS-II |
| `psi117` | `psi117_comparar`, `psi117_pontos`, `psi117_extincao_1atm` | Medido × modelo por pressão, pontos da fonte, extinção a 1 atm |
| `cfi` | `cfi_ensaio`, `cfi_agrupar` | Um ensaio do CFI com seus alertas; contagens e medidas por grupo |
| `psi142` | `psi142_conjuntos`, `psi142_serie` | Os conjuntos digitalizados e os pontos de cada série |
| `comparacao` | `comparacao_c12`, `comparacao_correspondencia` | PSI-117 × CFI lado a lado e a correspondência ponto a ponto |
| `qualidade` | `alertas`, `fonte_dos_dados`, `cautelas` | Alertas, origem do dado (amostra ou completo) e o que não concluir |
| `catalogo` | `listar_investigacoes`, `inventario_arquivos` | As investigações, o que falta e os arquivos de `dados/` |
| `dicionario` | `dicionario` | Significado, unidade e cabeçalho original de colunas e categorias |

| Página | Grupos ligados |
|---|---|
| Visão geral | catalogo, qualidade, dicionario |
| FLEX | tela, flex, qualidade, dicionario |
| BASS-II | tela, bass, qualidade, dicionario |
| PSI-117 | tela, psi117, qualidade, dicionario |
| CFI | tela, cfi, qualidade, dicionario |
| PSI-142 | tela, psi142, qualidade, dicionario |
| PSI-117 × CFI | tela, comparacao, qualidade (só PSI-117 e PSI-39), dicionario |
| Explorar | tela, dicionario |

O que fica de fora de propósito: SQL livre, acesso à web, leitura direta de `dados/` e qualquer
ferramenta que junte investigações fora da página de comparação. Nas páginas de investigação, `alertas`,
`fonte_dos_dados` e `cautelas` só respondem sobre aquela investigação.

Para mudar o escopo, edite `GROUPS`, `PAGE_GROUPS` e a lista de ferramentas em
[tools.py](src/spaceapps/assistant/tools.py); o prompt de sistema está em
[agent.py](src/spaceapps/assistant/agent.py).

## Por que Python no servidor

O gargalo de um dashboard de análise não é concorrência de servidor: é ler, agregar e desenhar
dados, e depois esperar a resposta de um modelo.

- **Análise.** A carga, o banco e as ferramentas do assistente usam Polars e DuckDB, que não têm par
  em Go ou Node. A API só serve tabelas já prontas.
- **Parte visual.** Quem desenha é o navegador: o React cuida da interface e desenha os gráficos em SVG.
  Com o front-end separado, a tela responde aos filtros sem ida ao servidor.
- **Desempenho.** O trabalho pesado roda no Polars e no DuckDB, ambos nativos e multinúcleo.

**Quando rever:** se o projeto virar ingestão contínua em tempo real ou um serviço com muitos
usuários simultâneos, um serviço em Go faz sentido como peça de ingestão ao lado da API.
