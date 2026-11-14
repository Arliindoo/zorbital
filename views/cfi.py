"""PSI-39 CFI: chamas frias de gotas de n-dodecano e misturas na ISS."""

import polars as pl
import streamlit as st

from spaceapps import charts, db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
inv = db.investigation("PSI-39")
data = db.query("SELECT * FROM cfi_ensaios ORDER BY teste_id")
mode = ui.theme()
ui.investigation_header(inv, data.height)

with st.sidebar:
    st.header("Filtros")
    fuels = [f for f in charts.DOMAIN_ORDER["combustivel"] if f in set(data["combustivel"])]
    fuel = st.multiselect("Combustível", fuels, default=fuels[:1])
    diluents = sorted(set(data["diluente"]))
    diluent = st.multiselect("Diluente", diluents, default=diluents)
    pressures = sorted(set(data["pressao_atm"].drop_nulls()))
    pressure = st.multiselect("Pressão (atm)", pressures, default=pressures)
    d0 = ui.range_filter("Diâmetro inicial D0 (mm)", data["d0_mm"], key="cfi_d0")
    complete = st.toggle("Só ensaios com análise concluída", value=False)

view = data.filter(
    pl.col("combustivel").is_in(fuel)
    & pl.col("diluente").is_in(diluent)
    & pl.col("pressao_atm").is_in(pressure)
)
if d0:
    view = view.filter(pl.col("d0_mm").is_between(*d0) | pl.col("d0_mm").is_null())
if complete:
    view = view.filter(pl.col("analise_completa"))

cols = st.columns(4)
cols[0].metric("Ensaios no filtro", view.height)
cols[1].metric("Com extinção da chama quente", view["dext_quente_mm"].drop_nulls().len())
cols[2].metric("Com extinção da chama fria", view["dext_fria_mm"].drop_nulls().len())
cols[3].metric(
    "Chama fria sem extinção visível", view.filter(pl.col("dext_fria_zero_na_fonte")).height,
    help="Zero na fonte: a gota foi consumida pela chama fria sem extinção visível.",
)  # fmt: skip
if view.is_empty():
    st.info("Nenhum ensaio com esses filtros.")
    st.stop()

# um ponto por ensaio e por tipo de chama
long = pl.concat(
    [
        view.select(
            "teste_id", "pressao_atm", "d0_mm", "combustivel", pl.col(col).alias("dext_mm")
        ).with_columns(tipo_chama=pl.lit(flame))
        for col, flame in (("dext_quente_mm", "Chama quente"), ("dext_fria_mm", "Chama fria"))
    ]
).drop_nulls("dext_mm")
labels = {
    "pressao_atm": "Pressão (atm)",
    "dext_mm": "Diâmetro de extinção (mm)",
    "tipo_chama": "Chama",
    "d0_mm": "D0 (mm)",
    "dext_quente_mm": "Extinção da chama quente (mm)",
    "combustivel": "Combustível",
}

left, right = ui.side_by_side(2)
with left:
    st.subheader("Extinção por pressão")
    st.caption("Cada ponto é um ensaio. Ensaios sem extinção visível da chama fria não aparecem.")
    st.plotly_chart(
        charts.scatter(
            long,
            x="pressao_atm",
            y="dext_mm",
            color="tipo_chama",
            labels=labels,
            hover=["teste_id", "d0_mm", "combustivel"],
            mode=mode,
        ),  # fmt: skip
        theme=None,
        width="stretch",
    )
with right:
    st.subheader("Tamanho inicial × extinção da chama quente")
    st.caption("O diâmetro de extinção cresce com a gota inicial: compare pressões com D0 parecido.")
    st.plotly_chart(
        charts.scatter(
            view.drop_nulls(["d0_mm", "dext_quente_mm"]),
            x="d0_mm",
            y="dext_quente_mm",
            color="combustivel",
            labels=labels,
            hover=["teste_id", "pressao_atm"],
            mode=mode,
        ),  # fmt: skip
        theme=None,
        width="stretch",
    )

st.subheader("Resumo por condição")
summary = db.query("SELECT * FROM v_cfi_por_pressao").filter(
    pl.col("combustivel").is_in(fuel)
    & pl.col("diluente").is_in(diluent)
    & pl.col("pressao_atm").is_in(pressure)
)
st.dataframe(summary, hide_index=True, width="stretch")

st.subheader("Ensaios")
st.dataframe(
    view.drop("fonte_arquivo"),
    hide_index=True,
    width="stretch",
    column_config={
        "dext_fria_zero_na_fonte": st.column_config.CheckboxColumn(
            "Chama fria sem extinção visível", help="A fonte registra 0: gota consumida pela chama fria."
        ),
        "dext_fria_extrapolado": st.column_config.CheckboxColumn("Dext fria extrapolado"),
        "analise_completa": st.column_config.CheckboxColumn("Análise concluída"),
        "comentario": st.column_config.TextColumn("Comentário do operador", width="large"),
    },
)
with st.expander("Câmeras de cada ensaio"):
    st.dataframe(
        db.query("SELECT * EXCLUDE (fonte_arquivo) FROM cfi_cameras"), hide_index=True, width="stretch"
    )
ui.alerts_table("PSI-39")

ui.chat_widget(
    Screen(
        pagina="cfi",
        titulo=inv["nome"],
        investigacao="PSI-39",
        filtros={
            "combustível": fuel,
            "diluente": diluent,
            "pressão (atm)": pressure,
            "D0 (mm)": d0,
            "só análise concluída": complete,
        },  # fmt: skip
        graficos=[
            "Extinção por pressão: um ponto por ensaio, pressão (x) × diâmetro de extinção (y), "
            "cor por tipo de chama (azul = fria, laranja = quente).",
            "Tamanho inicial × extinção da chama quente: D0 (x) × Dext quente (y), cor por combustível.",
        ],
        dados=view.drop("fonte_arquivo", "comentario"),
        tabela_banco="cfi_ensaios",
    )
)
