"""PSI-117: diâmetro de extinção medido × modelado, por pressão."""

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
        ],
        dados=comparison,
        tabela_banco="v_psi117_comparacao",
    )
)
