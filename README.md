# Space Apps

Dashboard interativo para analisar dados, comparar séries e pedir uma interpretação à IA.

## Como rodar

Pré-requisito: [uv](https://docs.astral.sh/uv/) (ele instala o Python 3.12 e as dependências sozinho).

```bash
uv sync                          # cria .venv e instala tudo do uv.lock
cp .env.example .env             # depois preencha ANTHROPIC_API_KEY
uv run streamlit run app.py      # abre em http://localhost:8501
```

Sem arquivo carregado, o app usa o conjunto de exemplo Gapminder. Sem a chave da API, tudo
funciona menos o botão **Interpretar**.

Outros comandos:

```bash
uv run pytest          # testes de fumaça (inclui subir o app sem navegador)
uv run ruff check .    # lint
uv run ruff format .   # formatação
uv add <pacote>        # nova dependência
```

## Estrutura

| Caminho | O que é |
|---|---|
| `app.py` | A página: fonte de dados, recorte, gráfico, tabela e a leitura da IA |
| `src/spaceapps/data.py` | Carga (CSV, Parquet) e agregação com Polars |
| `src/spaceapps/charts.py` | Gráficos Plotly e o sistema de cores (paleta fixa, claro e escuro) |
| `src/spaceapps/ai.py` | Chamada ao Claude: o que é enviado e como a resposta chega |
| `tests/` | Testes de fumaça |
| `data/` | Seus conjuntos de dados locais — o git ignora o conteúdo |
| `.streamlit/config.toml` | Configuração do servidor (sem telemetria, recarrega ao salvar) |

## Por que Python, e não Go

O gargalo de um dashboard de análise não é concorrência de servidor: é ler, agregar e desenhar
dados, e depois esperar a resposta de um modelo.

- **Parte visual.** Nenhuma das duas linguagens desenha o gráfico — quem desenha é o navegador.
  Em Python, Streamlit e Plotly geram essa interface a partir do próprio código de análise. Em Go
  não há equivalente: seria preciso escrever um front-end separado em JavaScript e uma API para
  alimentá-lo, ou seja, dois projetos.
- **Análise.** Polars, DuckDB, pandas, scikit-learn e statsmodels não têm par em Go.
- **Desempenho.** O trabalho pesado não roda em Python: o Polars é escrito em Rust e usa todos os
  núcleos da máquina. A vantagem de concorrência do Go não chega a ser exercida aqui.
- **IA.** As duas têm SDK oficial da Anthropic; em Python a resposta em streaming vai direto para
  a tela (`st.write_stream`).

**Quando rever:** se o projeto virar um serviço com muitos usuários simultâneos, ingestão contínua
de dados em tempo real ou um binário único para distribuir, um serviço em Go passa a fazer sentido
— como peça de ingestão ao lado deste dashboard, não no lugar dele. Outro limite é do Streamlit,
não do Python: ele reexecuta o script a cada interação, e telas com interação muito customizada
pedem Dash ou um front-end próprio sobre FastAPI.

## O que a IA recebe

Apenas o recorte que está no gráfico: o esquema das colunas, um resumo por série e a tabela
agregada. Se a tabela passar de 400 linhas, vai só o resumo, e a página avisa. As linhas brutas do
arquivo não são enviadas.

O modelo padrão é `claude-opus-5-5`; troque por `ANTHROPIC_MODEL` no `.env`. A chamada liga o
*fallback* do lado do servidor: se o modelo recusar um pedido por política, a API o refaz em um
modelo de reserva.
