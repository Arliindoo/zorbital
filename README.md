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

## Como rodar

Pré-requisito: [uv](https://docs.astral.sh/uv/) (ele instala o Python 3.12 e as dependências sozinho).

```bash
uv sync                          # cria .venv e instala tudo do uv.lock
cp .env.example .env             # depois preencha ZYRIA_BASE_URL e ZYRIA_API_KEY
uv run streamlit run app.py      # abre em http://localhost:8501
```

Quem clona o repositório não precisa baixar tabela nenhuma: na primeira abertura, o app monta o
banco a partir da **seed** versionada em `seed/`. Sem a chave da API, tudo funciona menos o
assistente.

Quem tem os arquivos originais em `dados/` e muda algo neles roda a carga, que refaz o banco e a
seed, e depois faz commit de `seed/`:

```bash
uv run spaceapps-build           # lê dados/, gera data/zorbital.duckdb e regrava seed/
uv run spaceapps-seed            # (opcional) refaz o banco só a partir da seed
```

Outros comandos:

```bash
uv run pytest          # testes da carga e de todas as páginas (com uma pasta dados/ sintética)
uv run ruff check .    # lint
uv run ruff format .   # formatação
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
dashboard (só leitura)
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

## Estrutura

| Caminho | O que é |
|---|---|
| `app.py` | Navegação entre as páginas |
| `views/` | Uma página por investigação, a Visão geral e o explorador livre |
| `src/spaceapps/ingest/` | Leitura de cada fonte, catálogo de arquivos e montagem do banco |
| `src/spaceapps/db.py` | Leitura do banco (só leitura) |
| `src/spaceapps/charts.py` | Gráficos Plotly e as cores fixas por categoria (claro e escuro) |
| `src/spaceapps/assistant/` | Assistente: estado da tela, ferramentas por grupo, cliente Zyria e o laço |
| `src/spaceapps/ui.py` | Peças de tela repetidas: cabeçalho, alertas, chat |
| `tests/` | Pasta `dados/` sintética, testes da carga e de cada página |

## Assistente

Um botão no canto inferior direito abre o assistente, que explica o que está na tela. O painel fica
fixo por cima da página e não fecha ao clicar fora, para dar para mexer nos filtros enquanto se
conversa; ele continua aberto ao trocar de página, com uma conversa separada para cada uma.
O botão de expandir no cabeçalho do painel o fixa na lateral direita, com a altura toda da tela: a
página encolhe para não ficar coberta e os gráficos lado a lado passam a ser empilhados. O provedor é a **Zyria** (API compatível
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

## Por que Python, e não Go

O gargalo de um dashboard de análise não é concorrência de servidor: é ler, agregar e desenhar
dados, e depois esperar a resposta de um modelo.

- **Parte visual.** Quem desenha o gráfico é o navegador. Em Python, Streamlit e Plotly geram a
  interface a partir do próprio código de análise; em Go seria preciso um front-end separado.
- **Análise.** Polars, DuckDB e o ecossistema científico não têm par em Go.
- **Desempenho.** O trabalho pesado roda no Polars e no DuckDB, ambos nativos e multinúcleo.

**Quando rever:** se o projeto virar ingestão contínua em tempo real ou um serviço com muitos
usuários simultâneos, um serviço em Go faz sentido como peça de ingestão ao lado do dashboard.
