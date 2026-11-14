"""Explorador livre: qualquer tabela do banco, ou um arquivo enviado, em comparação por séries."""

import polars as pl
import streamlit as st

from spaceapps import charts, data, db, ui
from spaceapps.assistant.screen import Screen

EXAMPLE = "Exemplo Gapminder"


@st.cache_data(show_spinner="Carregando dados…")
def load(source: str, file=None) -> pl.DataFrame:
    if file is not None:
        return data.load_file(file, file.name)
    if source == EXAMPLE:
        return data.load_example()
    return db.query(f'SELECT * FROM "{source}"')


with st.sidebar:
    st.header("Dados")
    options = (db.tables() if db.exists() else []) + [EXAMPLE]
    source = st.selectbox("Tabela", options)
    uploaded = st.file_uploader("…ou envie um CSV/Parquet", type=["csv", "parquet"])

try:
    df = load(source, uploaded)
except Exception as error:  # arquivo malformado: mostra o motivo em vez de derrubar a página
    st.error(f"Não foi possível ler o arquivo: {error}")
    st.stop()

st.title("Explorar")
st.caption(
    f"{uploaded.name if uploaded else source} · {df.height:,} linhas · {df.width} colunas".replace(",", ".")
)

categories, numbers = data.category_columns(df), data.numeric_columns(df)
if not categories or not numbers:
    st.warning(
        "Para comparar, a tabela precisa de uma coluna de texto (o que comparar) e uma numérica (a medida)."
    )
    st.dataframe(df, width="stretch")
    st.stop()

with st.sidebar:
    st.header("Comparação")
    by = st.selectbox("Comparar por", categories)
    values = df[by].drop_nulls().unique().sort().to_list()
    entities = st.multiselect(
        "Séries", values, default=values[:3], max_selections=charts.MAX_SERIES, key=f"entities:{source}:{by}"
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

if not entities:
    st.info("Escolha ao menos uma série na barra lateral.")
    st.stop()

table = data.compare(df, by=by, entities=entities, x=x, measure=measure, agg=agg)
summary = data.summarize(table, by=by, x=x, measure=measure)

# A cor acompanha a entidade entre reexecuções: mudar o filtro não repinta quem ficou.
key = f"slots:{source}:{by}"
slots = st.session_state[key] = charts.assign_slots(entities, st.session_state.get(key, {}))

st.subheader(f"{agg.capitalize()} de {measure} por {x}")
figure = charts.comparison_chart(
    table, x=x, measure=measure, by=by, slots=slots, ordered=data.is_ordered(df, x), mode=ui.theme()
)
st.plotly_chart(figure, theme=None, width="stretch")

with st.expander("Ver como tabela"):
    st.dataframe(summary, width="stretch", hide_index=True)
    st.dataframe(table, width="stretch", hide_index=True)

ui.chat_widget(
    Screen(
        pagina="explore",
        titulo="Explorar",
        filtros={
            "tabela": uploaded.name if uploaded else source,
            "comparar por": by,
            "séries": entities,
            "eixo X": x,
            "medida": measure,
            "agregação": agg,
        },  # fmt: skip
        graficos=[f"{agg.capitalize()} de {measure} por {x}, uma série por valor de {by}."],
        dados=table,
        tabela_banco=None if uploaded else source,
    )
)
