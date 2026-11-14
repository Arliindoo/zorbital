"""PSI-69 FLEX: gotas de combustível líquido."""

import polars as pl
import streamlit as st

from spaceapps import charts, db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
inv = db.investigation("PSI-69")
data = db.query("SELECT * FROM flex_ensaios ORDER BY teste_id::INT")
mode = ui.theme()
ui.investigation_header(inv, data.height)

with st.sidebar:
    st.header("Filtros")
    outcomes = st.multiselect(
        "Desfecho", charts.DOMAIN_ORDER["desfecho"], default=charts.DOMAIN_ORDER["desfecho"]
    )
    fuels = data["combustivel"].unique().sort().to_list()
    fuel = st.multiselect("Combustível", fuels, default=fuels)
    pressure = ui.range_filter("Pressão (mmHg)", data["pressao_mmhg"], key="flex_p", fmt="%.0f")
    oxygen = ui.range_filter("Oxigênio (fração molar)", data["oxigenio_fracao"], key="flex_o2")

view = data.filter(pl.col("desfecho").is_in(outcomes) & pl.col("combustivel").is_in(fuel))
for column, bounds in (("pressao_mmhg", pressure), ("oxigenio_fracao", oxygen)):
    if bounds:
        view = view.filter(pl.col(column).is_between(*bounds) | pl.col(column).is_null())

cols = st.columns(4)
cols[0].metric("Ensaios no filtro", view.height)
cols[1].metric("Extinções", view.filter(pl.col("desfecho") == "Extinção").height)
if view.is_empty():
    st.info("Nenhum ensaio com esses filtros.")
    st.stop()
cols[2].metric("O2 (fração molar)", f"{view['oxigenio_fracao'].min():g}–{view['oxigenio_fracao'].max():g}")
cols[3].metric("Pressão (mmHg)", f"{view['pressao_mmhg'].min():.0f}–{view['pressao_mmhg'].max():.0f}")

labels = {
    "diametro_inicial_mm": "Diâmetro inicial da gota (mm)",
    "diametro_extincao_visivel_mm": "Diâmetro na extinção visível (mm)",
    "oxigenio_fracao": "Oxigênio (fração molar)",
    "pressao_mmhg": "Pressão (mmHg)",
    "desfecho": "Desfecho",
}
hover = ["teste_id", "identificador", "oxigenio_fracao", "pressao_mmhg", "helio_fracao"]

left, right = ui.side_by_side(2)
with left:
    st.subheader("Condições testadas")
    st.caption("Cada ponto é um ensaio. Veja onde as condições se concentram antes de comparar desfechos.")
    st.plotly_chart(
        charts.scatter(
            view,
            x="oxigenio_fracao",
            y="pressao_mmhg",
            color="desfecho",
            labels=labels,
            hover=hover,
            mode=mode,
        ),
        theme=None,
        width="stretch",
    )
with right:
    st.subheader("Tamanho da gota: início × extinção")
    with_ext = view.drop_nulls(["diametro_inicial_mm", "diametro_extincao_visivel_mm"])
    missing = view.height - with_ext.height
    st.caption(
        "Só ensaios com os dois diâmetros registrados"
        + (f"; {missing} ficaram de fora por diâmetro ausente na fonte." if missing else ".")
    )
    st.plotly_chart(
        charts.scatter(
            with_ext,
            x="diametro_inicial_mm",
            y="diametro_extincao_visivel_mm",
            color="desfecho",
            labels=labels,
            hover=hover,
            mode=mode,
        ),  # fmt: skip
        theme=None,
        width="stretch",
    )

st.subheader("Ensaios")
st.dataframe(
    view.drop("fonte_arquivo", "desfecho_original"),
    hide_index=True,
    width="stretch",
    column_config={
        "gas_co_rotulo_ambiguo_fracao": st.column_config.NumberColumn(
            '"CO" (rótulo ambíguo)',
            help="O cabeçalho da fonte perdeu o subscrito do gás. Não é necessariamente CO2.",
        ),
        "taxa_queima_valor": st.column_config.NumberColumn(
            "Taxa de queima", help="Rótulo da fonte: 'Burning rate; mm'. Unidade a conferir no relatório."
        ),
    },
)
ui.alerts_table("PSI-69")

ui.chat_widget(
    Screen(
        pagina="flex",
        titulo=inv["nome"],
        investigacao="PSI-69",
        filtros={
            "desfecho": outcomes,
            "combustível": fuel,
            "pressão (mmHg)": pressure,
            "oxigênio (fração)": oxygen,
        },
        graficos=[
            "Condições testadas: dispersão oxigênio (x) × pressão (y), um ponto por ensaio, cor por desfecho.",
            f"Tamanho da gota: diâmetro inicial (x) × diâmetro na extinção visível (y), cor por desfecho; "
            f"{missing} ensaio(s) fora por diâmetro ausente.",
        ],
        dados=view.drop("fonte_arquivo"),
        tabela_banco="flex_ensaios",
    )
)
