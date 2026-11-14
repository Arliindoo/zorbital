"""PSI-117: diâmetro de extinção medido × modelado, por pressão."""

import polars as pl
import streamlit as st

from spaceapps import charts, db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
inv = db.investigation("PSI-117")
points = db.query("SELECT * FROM psi117_extincao ORDER BY tipo_chama, serie, pressao_atm")
comparison = db.query("SELECT * FROM v_psi117_comparacao")
mode = ui.theme()
ui.investigation_header(inv, points.height)

st.subheader("Diâmetro de extinção por pressão")
st.caption(
    "Pontos: medição · losangos tracejados: modelo · faixa clara: incerteza informada na fonte "
    "(só existe para a chama fria). Cada tipo de chama tem sua cor."
)
st.plotly_chart(charts.measured_vs_model(points, comparison, mode), theme=None, width="stretch")

st.subheader("Medido × modelo, lado a lado")
st.caption(
    "Onde há duas medições na mesma pressão, a coluna Medido é a média e Nº medições mostra quantas são. "
    "“Modelo dentro da faixa” compara o modelo com a faixa de incerteza informada."
)
st.dataframe(
    comparison,
    hide_index=True,
    width="stretch",
    column_config={
        "tipo_chama": "Chama",
        "pressao_atm": st.column_config.NumberColumn("Pressão (atm)"),
        "medido_mm": st.column_config.NumberColumn("Medido (mm)", format="%.2f"),
        "n_medicoes": st.column_config.NumberColumn("Nº medições"),
        "modelo_mm": st.column_config.NumberColumn("Modelo (mm)", format="%.2f"),
        "limite_inferior_mm": st.column_config.NumberColumn("Faixa: mín. (mm)", format="%.2f"),
        "limite_superior_mm": st.column_config.NumberColumn("Faixa: máx. (mm)", format="%.2f"),
        "diferenca_mm": st.column_config.NumberColumn("Modelo − medido (mm)", format="%+.2f"),
        "modelo_na_faixa": st.column_config.CheckboxColumn("Modelo dentro da faixa"),
    },
)

with st.expander("Pontos como estão na fonte"):
    st.dataframe(points.drop("fonte_arquivo"), hide_index=True, width="stretch")
st.page_link(
    "views/comparacao.py", label="Comparar com os ensaios de voo do CFI", icon=":material/compare_arrows:"
)

tables = set(db.tables())
extra_charts = []
if "psi117_extincao_1atm" in tables:
    st.subheader("Extinção a 1 atm por tamanho inicial da gota")
    st.caption(
        "n-heptano, n-decano e n-dodecano em ar. Medição em pontos (cada um é uma gota), modelo em linha tracejada; "
        "um painel por tipo de chama. Zeros da fonte (sem extinção ou sem chama) ficam de fora."
    )
    one_atm = db.query("SELECT * FROM psi117_extincao_1atm")
    panels = ui.side_by_side(2)
    for panel, (col, flame) in zip(panels, (("dext_quente_mm", "Chama quente"), ("dext_fria_mm", "Chama fria")),
                                   strict=True):  # fmt: skip
        part = one_atm.filter(pl.col(col) > 0)
        with panel:
            st.markdown(f"**{flame}**")
            st.plotly_chart(
                charts.measured_model_by_fuel(
                    part,
                    x="d0_mm",
                    y=col,
                    x_title="D0 (mm)",
                    y_title=f"Extinção da {flame.lower()} (mm)",
                    mode=mode,
                ),
                theme=None,
                width="stretch",
            )
    extra_charts.append(
        "Extinção a 1 atm: D0 (x) × diâmetro de extinção (y), por combustível e medição/modelo."
    )

if "psi117_series_modelo" in tables:
    st.subheader("Modelo numérico: evolução de uma gota de n-heptano")
    series = db.query("SELECT * FROM psi117_series_modelo")
    variables = {"Diâmetro da gota (mm)": "diametro_mm", "Temperatura máxima (K)": "t_max_k",
                 "(D/D0)²": "d_d0_quadrado", "Taxa de queima K (mm²/s)": "k_mm2_s"}  # fmt: skip
    chosen = st.segmented_control("Variável", list(variables), default="Temperatura máxima (K)")
    st.plotly_chart(
        charts.xy_lines(
            series,
            x="t_s",
            y=variables[chosen or "Temperatura máxima (K)"],
            series="cenario",
            x_title="Tempo (s)",
            y_title=chosen or "Temperatura máxima (K)",
            mode=mode,
            markers=False,
        ),  # fmt: skip
        theme=None,
        width="stretch",
    )
    st.caption(
        "Resultado de simulação (SIMULADO), não medição. Cenários: "
        + ", ".join(sorted(set(series["cenario"])))
    )
    extra_charts.append(f"Série temporal do modelo: tempo (x) × {chosen} (y), uma linha por cenário.")

if "psi117_tabelas" in tables:
    with st.expander("Tabelas desta investigação (segundo o ReadMe)", icon=":material/table_view:"):
        listed = db.query("SELECT * EXCLUDE (fonte_arquivo) FROM psi117_tabelas")
        st.caption(f"{listed['presente_em_dados'].sum()} de {listed.height} estão em `dados/`.")
        st.dataframe(listed, hide_index=True, width="stretch",
                     column_config={"presente_em_dados": st.column_config.CheckboxColumn("Em dados/")})  # fmt: skip
ui.alerts_table("PSI-117")

ui.chat_widget(
    Screen(
        pagina="psi117",
        titulo=inv["nome"],
        investigacao="PSI-117",
        graficos=[
            "Diâmetro de extinção (y, mm) por pressão (x, atm): medição em pontos, modelo em losangos "
            "com linha tracejada, faixa de incerteza da chama fria como barra vertical clara. "
            "Cor laranja = chama quente, azul = chama fria.",
            "Tabela medido × modelo por pressão, com diferença e se o modelo cai dentro da faixa.",
            *extra_charts,
        ],
        dados=comparison,
        tabela_banco="v_psi117_comparacao",
    )
)
