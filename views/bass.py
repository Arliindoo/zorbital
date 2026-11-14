"""PSI-25 BASS-II: materiais sólidos."""

import polars as pl
import streamlit as st

from spaceapps import charts, db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
inv = db.investigation("PSI-25")
data = db.query("SELECT * FROM bass_ensaios ORDER BY pesquisador, teste_id")
mode = ui.theme()
ui.investigation_header(inv, data.height)

with st.sidebar:
    st.header("Filtros")
    pis = data["pesquisador"].unique().sort().to_list()
    pi = st.multiselect("Pesquisador", pis, default=pis)
    materials = [m for m in charts.DOMAIN_ORDER["material_categoria"] if m in set(data["material_categoria"])]
    material = st.multiselect("Material", materials, default=materials)
    shapes = data["geometria"].unique().sort().to_list()
    shape = st.multiselect("Geometria", shapes, default=shapes)
    oxygen = ui.range_filter("O2 inicial (% vol)", data["o2_inicial_pct"], key="bass_o2", fmt="%.1f")

view = data.filter(
    pl.col("pesquisador").is_in(pi)
    & pl.col("material_categoria").is_in(material)
    & pl.col("geometria").is_in(shape)
)
if oxygen:
    view = view.filter(pl.col("o2_inicial_pct").is_between(*oxygen))

with_alerts = set(db.alerts("PSI-25")["teste_id"])
cols = st.columns(4)
cols[0].metric("Testes no filtro", view.height)
cols[1].metric("Materiais × geometrias", view.select("material_categoria", "geometria").unique().height)
if view.is_empty():
    st.info("Nenhum teste com esses filtros.")
    st.stop()
cols[2].metric("O2 inicial (% vol)", f"{view['o2_inicial_pct'].min():g}–{view['o2_inicial_pct'].max():g}")
cols[3].metric("Testes com alerta", view.filter(pl.col("teste_id").is_in(with_alerts)).height)

left, right = ui.side_by_side([2, 3])
with left:
    st.subheader("O que foi testado")
    st.caption("Testes por material e geometria. Contagem de ensaios, não medida de desempenho.")
    groups = (
        view.group_by("material_categoria", "geometria")
        .len("testes")
        # Duas linhas por rótulo: com a página estreita (assistente expandido), "material · geometria"
        # numa linha só não cabe e o Plotly corta o começo.
        .with_columns(grupo=pl.col("material_categoria") + "<br>" + pl.col("geometria"))
    )
    st.plotly_chart(
        charts.counts_bar(groups, category="grupo", value="testes", mode=mode), theme=None, width="stretch"
    )
with right:
    st.subheader("Oxigênio inicial × CO2 produzido")
    st.caption(
        "ΔCO2 = final − inicial na câmara. Depende da duração e do protocolo de cada teste: "
        "**não é um ranking de risco dos materiais**."
    )
    labels = {
        "o2_inicial_pct": "O2 inicial (% vol)",
        "delta_co2_pp": "ΔCO2 (pontos percentuais)",
        "material_categoria": "Material",
    }
    st.plotly_chart(
        charts.scatter(
            view.drop_nulls("delta_co2_pp"),
            x="o2_inicial_pct",
            y="delta_co2_pp",
            color="material_categoria",
            labels=labels,
            hover=["teste_id", "pesquisador", "material_original", "geometria"],
            mode=mode,
        ),  # fmt: skip
        theme=None,
        width="stretch",
    )

st.subheader("Testes")
st.caption(
    "Ventilador e ar: o texto é o que foi anotado no painel, com os ajustes feitos durante o teste. "
    "Não são velocidades calibradas."
)
st.dataframe(
    view.drop("fonte_arquivo"),
    hide_index=True,
    width="stretch",
    column_config={
        "material_original": "Material (texto da fonte)",
        "material_categoria": "Material",
        "ajustes_durante_teste": st.column_config.CheckboxColumn("Ajustes no teste"),
        "ventilador_display_unico": st.column_config.NumberColumn(
            "Ventilador (valor único)", help="Preenchido só quando a célula tinha um único número."
        ),
    },
)
ui.alerts_table("PSI-25")

ui.chat_widget(
    Screen(
        pagina="bass",
        titulo=inv["nome"],
        investigacao="PSI-25",
        filtros={"pesquisador": pi, "material": material, "geometria": shape, "O2 inicial (%)": oxygen},
        graficos=[
            "O que foi testado: barras horizontais com a contagem de testes por material · geometria.",
            "Oxigênio inicial × CO2 produzido: dispersão O2 inicial (x) × ΔCO2 em pontos percentuais (y), "
            "cor por material. Não é ranking de risco.",
        ],
        dados=view.drop("fonte_arquivo"),
        tabela_banco="bass_ensaios",
    )
)
