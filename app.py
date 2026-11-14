"""Dashboard: carregar dados, comparar séries e pedir uma leitura à IA.

Rodar: uv run streamlit run app.py
"""

from __future__ import annotations

import anthropic
import polars as pl
import streamlit as st
from dotenv import load_dotenv

from spaceapps import ai, charts, data

load_dotenv()
st.set_page_config(page_title="Space Apps — análise de dados", layout="wide")


@st.cache_data(show_spinner="Carregando dados…")
def load(file=None) -> pl.DataFrame:
    return data.load_example() if file is None else data.load_file(file, file.name)


# --- Fonte de dados -----------------------------------------------------------
with st.sidebar:
    st.header("Dados")
    uploaded = st.file_uploader("Arquivo CSV ou Parquet", type=["csv", "parquet"])
    if uploaded is None:
        st.caption("Sem arquivo: usando o conjunto de exemplo Gapminder.")

try:
    df = load(uploaded)
except Exception as error:  # arquivo malformado: mostra o motivo em vez de derrubar a página
    st.error(f"Não foi possível ler o arquivo: {error}")
    st.stop()

categories, numbers = data.category_columns(df), data.numeric_columns(df)
if not categories or not numbers:
    st.warning(
        "Para comparar, o conjunto precisa de ao menos uma coluna de texto (o que comparar) "
        "e uma numérica (a medida)."
    )
    st.dataframe(df, width="stretch")
    st.stop()

# --- Recorte --------------------------------------------------------------------
with st.sidebar:
    st.header("Comparação")
    by = st.selectbox("Comparar por", categories)
    options = df[by].drop_nulls().unique().sort().to_list()
    entities = st.multiselect(
        "Séries",
        options,
        default=options[:3],
        max_selections=charts.MAX_SERIES,
        key=f"entities:{by}",
    )
    x_options = [c for c in df.columns if c != by]
    # Por padrão, a primeira coluna que dá uma linha (tempo ou número).
    first_ordered = next((i for i, c in enumerate(x_options) if data.is_ordered(df, c)), 0)
    x = st.selectbox("Eixo X", x_options, index=first_ordered)
    measures = [c for c in numbers if c != x]
    if not measures:
        st.warning("Não sobrou coluna numérica para medir: escolha outro eixo X.")
        st.stop()
    measure = st.selectbox("Medida", measures)
    agg = st.selectbox("Agregação", list(data.AGGREGATIONS))

st.title("Análise de dados")
st.caption(f"{df.height:,} linhas · {df.width} colunas".replace(",", "."))

if not entities:
    st.info("Escolha ao menos uma série na barra lateral.")
    st.stop()

table = data.compare(df, by=by, entities=entities, x=x, measure=measure, agg=agg)
summary = data.summarize(table, by=by, x=x, measure=measure)

# A cor acompanha a entidade entre reexecuções: mudar o filtro não repinta quem ficou.
slots = st.session_state[f"slots:{by}"] = charts.assign_slots(
    entities, st.session_state.get(f"slots:{by}", {})
)

# --- Gráfico --------------------------------------------------------------------
st.subheader(f"{agg.capitalize()} de {measure} por {x}")
figure = charts.comparison_chart(
    table,
    x=x,
    measure=measure,
    by=by,
    slots=slots,
    ordered=data.is_ordered(df, x),
    mode=st.context.theme.type or "light",
)
st.plotly_chart(figure, theme=None, width="stretch")

with st.expander("Ver como tabela"):
    st.dataframe(summary, width="stretch", hide_index=True)
    st.dataframe(table, width="stretch", hide_index=True)

# --- Leitura da IA --------------------------------------------------------------
st.subheader("Interpretação com IA")
context, sent_full = ai.build_context(df, table, summary, by=by, x=x, measure=measure, agg=agg)
if not sent_full:
    st.caption(
        f"A tabela do gráfico tem {table.height} linhas (limite {ai.MAX_TABLE_ROWS}): "
        "a IA recebe só o resumo por série. Reduza o recorte para enviar os dados completos."
    )

with st.form("ai"):
    question = st.text_input(
        "Pergunta",
        value="O que mais chama atenção nesta comparação?",
    )
    asked = st.form_submit_button("Interpretar", type="primary")

if asked and question.strip():
    try:
        st.write_stream(ai.interpret(context, question))
    except (anthropic.AuthenticationError, TypeError):
        # TypeError é o que o SDK levanta quando não encontra credencial nenhuma.
        st.error(
            "Credencial da API ausente ou inválida. Copie `.env.example` para `.env` "
            "e preencha `ANTHROPIC_API_KEY`."
        )
    except anthropic.RateLimitError:
        st.error("Limite de requisições atingido. Aguarde um pouco e tente de novo.")
    except anthropic.APIStatusError as error:
        st.error(f"A API respondeu com erro {error.status_code}: {error.message}")
    except anthropic.APIConnectionError:
        st.error("Sem conexão com a API. Verifique a rede e tente de novo.")
