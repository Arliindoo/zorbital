"""Comparação PSI-117 × CFI: diâmetro de extinção de gotas de n-dodecano por pressão."""

import polars as pl
import streamlit as st

from spaceapps import charts, db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
mode = ui.theme()
psi = db.query("SELECT * FROM v_psi117_comparacao")
tests = db.query("SELECT * FROM cfi_ensaios WHERE combustivel = 'n-dodecano' ORDER BY pressao_atm, teste_id")
links = db.query("SELECT * FROM psi117_cfi_correspondencia")
conditions = db.query(
    "SELECT * FROM psi117_tabelas WHERE arquivo = 'PROCI_2023_C12_Extinction_Diameter_vs_pressure'"
)

st.title("PSI-117 × CFI")
st.caption(
    "Diâmetro de extinção de gotas de n-dodecano por pressão · modelo e medições em solo × ensaios na ISS"
)

same_test = links.filter(pl.col("situacao").str.starts_with("mesmo ensaio"))
one_atm = links.filter(pl.col("tabela_psi117") == "extinção a 1 atm")
by_pressure = links.filter(pl.col("tabela_psi117") == "extinção por pressão")
st.warning(
    "**Não é uma validação independente.** As medições do PSI-117 vêm de ensaios de voo no aparelho do FLEX, "
    f"o mesmo do CFI: na tabela de 1 atm, {one_atm.filter(pl.col('cfi_teste_id').is_not_null())['d0_mm'].n_unique()} "
    f"de {one_atm['d0_mm'].n_unique()} gotas medidas são ensaios do CFI. Na tabela por pressão, "
    f"{by_pressure.filter(pl.col('cfi_teste_id').is_not_null()).height} de {by_pressure.height} pontos coincidem "
    "com um ensaio individual; os outros podem ser médias ou outro tratamento. O que esta página mostra é "
    "**quanto o modelo do PSI-117 se afasta do conjunto completo de voos**, não uma segunda opinião experimental.",
    icon=":material/link:",
)
if conditions.height:
    c = conditions.row(0, named=True)
    st.caption(
        f"Condições declaradas pelo PSI-117 para esta tabela: D0 ≈ {c['d0_mm_texto']} mm, "
        f"{c['pressao_atm_texto']} atm, XO2 = {c['xo2_texto']}, XN2 = {c['xn2_texto']}. "
        "Os filtros abaixo começam nessas condições."
    )

with st.sidebar:
    st.header("Ensaios do CFI")
    diluents = sorted(set(tests["diluente"]))
    diluent = st.multiselect(
        "Diluente", diluents, default=["Nitrogênio"] if "Nitrogênio" in diluents else diluents
    )
    d0 = ui.range_filter("D0 (mm)", tests["d0_mm"], key="cmp_d0")
    complete = st.toggle("Só análise concluída", value=False)

view = tests.filter(pl.col("diluente").is_in(diluent))
if d0:
    view = view.filter(pl.col("d0_mm").is_between(*d0) | pl.col("d0_mm").is_null())
if complete:
    view = view.filter(pl.col("analise_completa"))
long = pl.concat(
    [
        view.select("teste_id", "pressao_atm", "d0_mm", pl.col(col).alias("dext_mm")).with_columns(
            tipo_chama=pl.lit(flame)
        )
        for col, flame in (("dext_quente_mm", "Chama quente"), ("dext_fria_mm", "Chama fria"))
    ]
)

cols = st.columns(4)
cols[0].metric("Ensaios do CFI no filtro", view.height)
cols[1].metric(
    "Pressões com os dois estudos",
    psi.join(long.drop_nulls("dext_mm"), on="pressao_atm")["pressao_atm"].n_unique(),
)
cols[2].metric("Medições do PSI-117 que são ensaios do CFI", same_test["cfi_teste_id"].n_unique())
cols[3].metric(
    "Divergências entre as fontes", links.filter(pl.col("situacao").str.contains("diferente")).height
)

st.plotly_chart(charts.c12_comparison(long, psi, mode), theme=None, width="stretch")
st.caption(
    "Pontos azuis: cada ensaio do CFI no filtro · quadrados azuis: mediana do CFI por pressão (n no tooltip) · "
    "losangos: medição do "
    "PSI-117 · tracejado: modelo do PSI-117 · faixa clara: incerteza informada pelo PSI-117 (só chama fria). "
    "Ensaios em que a chama fria consumiu a gota sem extinção visível não aparecem no painel da chama fria."
)

# tabela lado a lado, recalculada com os filtros
cfi_agg = long.group_by("tipo_chama", "pressao_atm").agg(
    pl.len().alias("cfi_ensaios"),
    pl.col("dext_mm").count().alias("cfi_com_valor"),
    pl.col("dext_mm").median().round(3).alias("cfi_mediana_mm"),
    pl.col("dext_mm").min().alias("cfi_min_mm"),
    pl.col("dext_mm").max().alias("cfi_max_mm"),
)
table = (
    psi.select(
        "tipo_chama", "pressao_atm", "medido_mm", "modelo_mm", "limite_inferior_mm", "limite_superior_mm"
    )
    .join(cfi_agg, on=["tipo_chama", "pressao_atm"], how="full", coalesce=True)
    .with_columns(
        modelo_menos_cfi_mm=(pl.col("modelo_mm") - pl.col("cfi_mediana_mm")).round(3),
        cfi_na_faixa_psi117=pl.when(
            pl.col("limite_inferior_mm").is_not_null() & pl.col("cfi_mediana_mm").is_not_null()
        ).then(
            pl.col("cfi_mediana_mm").is_between(pl.col("limite_inferior_mm"), pl.col("limite_superior_mm"))
        ),
    )
    .sort("tipo_chama", "pressao_atm")
)
st.subheader("Lado a lado")
st.dataframe(
    table,
    hide_index=True,
    width="stretch",
    column_config={
        "medido_mm": st.column_config.NumberColumn("PSI-117 medido (mm)", format="%.2f"),
        "modelo_mm": st.column_config.NumberColumn("PSI-117 modelo (mm)", format="%.2f"),
        "limite_inferior_mm": st.column_config.NumberColumn("Faixa mín. (mm)", format="%.2f"),
        "limite_superior_mm": st.column_config.NumberColumn("Faixa máx. (mm)", format="%.2f"),
        "cfi_mediana_mm": st.column_config.NumberColumn("CFI mediana (mm)", format="%.3f"),
        "modelo_menos_cfi_mm": st.column_config.NumberColumn("Modelo − CFI (mm)", format="%+.3f"),
        "cfi_na_faixa_psi117": st.column_config.CheckboxColumn("CFI na faixa do PSI-117"),
    },
)

with st.expander(f"Correspondência ponto a ponto ({links.height})", icon=":material/link:"):
    st.caption(
        "Cada medição do PSI-117 e o ensaio do CFI de onde ela parece vir. Na tabela de 1 atm o ensaio é "
        "identificado pelo D0 e pelo diâmetro da chama quente, que batem exatamente."
    )
    st.dataframe(links.drop("fonte_arquivo", strict=False), hide_index=True, width="stretch")

with st.expander("O que não concluir desta comparação", icon=":material/info:"):
    for inv_id in ("PSI-117", "PSI-39"):
        inv = db.investigation(inv_id)
        st.markdown(f"**{inv['nome']}**")
        st.markdown(inv["cautelas"].replace(". ", ".\n\n"))

ui.chat_widget(
    Screen(
        pagina="comparacao",
        titulo="Comparação PSI-117 × CFI",
        escopo=["PSI-117", "PSI-39"],
        filtros={"diluente do CFI": diluent, "D0 do CFI (mm)": d0, "só análise concluída": complete},
        graficos=[
            "Dois painéis (chama quente, chama fria): pressão (x) × diâmetro de extinção (y). CFI: ensaios em "
            "pontos azuis e mediana em linha azul; PSI-117: medição em losangos laranja, modelo tracejado, "
            "faixa de incerteza clara (só chama fria).",
            "Tabela lado a lado por pressão: PSI-117 medido, modelo e faixa; CFI mediana, mínimo, máximo.",
        ],
        dados=table,
        tabela_banco="v_extincao_c12_comparacao",
    )
)
