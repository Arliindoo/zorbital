"""Visão geral: as três investigações, de onde veio cada dado e o que está incompleto."""

import polars as pl
import streamlit as st

from spaceapps import db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
meta = db.meta()
investigations = db.query("SELECT * FROM investigacoes")
sources = db.query("SELECT * FROM fontes ORDER BY status, caminho")
alerts = db.query("SELECT * FROM v_alertas_resumo")
counts = {
    "PSI-69": db.query("SELECT count(*) n FROM flex_ensaios").item(),
    "PSI-25": db.query("SELECT count(*) n FROM bass_ensaios").item(),
    "PSI-117": db.query("SELECT count(*) n FROM psi117_extincao").item(),
}

st.title("Combustão em microgravidade")
st.caption(f"Banco gerado em {meta['gerado_em'].replace('T', ' ')} a partir de `dados/`")
st.markdown(
    "Três investigações da NASA, cada uma respondendo a uma pergunta diferente. "
    "Elas ficam **separadas por tipo de evidência** e não devem ser misturadas num mesmo gráfico."
)

pages = {"PSI-69": "views/flex.py", "PSI-25": "views/bass.py", "PSI-117": "views/psi117.py"}
units = {"PSI-69": "ensaios", "PSI-25": "testes", "PSI-117": "pontos"}
for column, inv in zip(st.columns(3), investigations.iter_rows(named=True), strict=True):
    with column.container(border=True):
        st.markdown(f"**{inv['categoria']}**")
        st.caption(f"{inv['id']} · {inv['ambiente']} · {inv['tipo_evidencia']}")
        st.metric(units[inv["id"]].capitalize(), counts[inv["id"]])
        n_alerts = alerts.filter(pl.col("investigacao") == inv["id"])["ocorrencias"].sum()
        sample = "amostra" in (inv["fonte_carregada"] or "").lower()
        st.markdown(
            (
                ":orange-badge[:material/warning: Amostra]"
                if sample
                else ":green-badge[:material/check: Completo]"
            )
            + f" :gray-badge[{n_alerts} alertas]"
        )
        st.caption(inv["pergunta"])
        st.page_link(pages[inv["id"]], label="Abrir", icon=":material/arrow_forward:")

if investigations.filter(pl.col("fonte_carregada").str.contains("(?i)amostra")).height:
    with st.container(border=True):
        st.markdown(":material/download: **Como obter as tabelas completas**")
        st.markdown(
            "O FLEX aqui é uma amostra de 34 ensaios (o original tem cerca de 274). O gerador do pacote "
            "baixa as tabelas completas de uma cópia pública no GitHub e confere o hash de cada arquivo. "
            "Ao terminar, rode a carga de novo: o original completo passa a ter prioridade sobre a amostra."
        )
        st.code(
            "cd dados && python Zorbital/scripts/gerar_dados_zorbital.py Zorbital_dados_completos\n"
            "cd .. && uv run spaceapps-build",
            language="bash",
        )

st.info(meta["geral"], icon=":material/balance:")

st.subheader("Arquivos em `dados/`")
st.caption(
    "Cada arquivo foi identificado pelo hash. Duplicatas exatas e cópias derivadas não são carregadas; "
    "quando há original e amostra, o original vence."
)
status_order = ["Carregado", "Não carregado", "Duplicata exata", "Documentação", "Não reconhecido"]
summary = (
    sources.group_by("status")
    .len()
    .sort(pl.col("status").replace_strict(status_order, list(range(5)), default=9))
)
st.markdown(" · ".join(f"**{n}** {s.lower()}" for s, n in summary.iter_rows()))
st.dataframe(
    sources.select(
        "caminho", "investigacao", "papel", "status", "motivo", "linhas_carregadas", "tamanho_bytes"
    ),
    hide_index=True,
    width="stretch",
    column_config={
        "caminho": "Arquivo",
        "investigacao": "Investigação",
        "papel": "O que é",
        "status": "Status",
        "motivo": "Motivo",
        "linhas_carregadas": st.column_config.NumberColumn("Linhas carregadas"),
        "tamanho_bytes": st.column_config.NumberColumn("Bytes"),
    },
)

st.subheader("Alertas de qualidade")
st.caption(
    "Células que não puderam ser lidas como estão. O valor original fica registrado; nada é corrigido."
)
st.dataframe(
    db.alerts(),
    hide_index=True,
    width="stretch",
    column_config={"valor_original": "Valor na fonte", "teste_id": "Teste", "investigacao": "Investigação"},
)

ui.chat_widget(Screen(pagina="overview", titulo="Visão geral"))
