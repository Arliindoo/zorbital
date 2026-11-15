"""Visão geral: as investigações, de onde veio cada dado e o que ainda falta."""

import polars as pl
import streamlit as st

from spaceapps import db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
meta = db.meta()
investigations = db.query("SELECT * FROM investigacoes")
sources = db.query("SELECT * FROM fontes ORDER BY status, caminho")
alerts = db.query("SELECT * FROM v_alertas_resumo")
tables = set(db.tables())

# gotas primeiro (voo e solo), depois sólidos e contrafluxo
ORDER = ["PSI-69", "PSI-39", "PSI-117", "PSI-25", "PSI-142"]
UNITS = {
    "PSI-69": "Ensaios",
    "PSI-25": "Testes",
    "PSI-39": "Ensaios",
    "PSI-117": "Pontos",
    "PSI-142": "Pontos",
}
rows = sorted(
    investigations.iter_rows(named=True), key=lambda r: ORDER.index(r["id"]) if r["id"] in ORDER else 99
)

st.title("Combustão em microgravidade")
st.caption(f"Banco gerado em {meta['gerado_em'].replace('T', ' ')} a partir de `dados/`")
st.markdown(
    f"{len(rows)} investigações da NASA, cada uma respondendo a uma pergunta diferente. "
    "Elas ficam **separadas por tipo de evidência**; a única comparação numérica entre elas tem página própria."
)

for start in range(0, len(rows), 3):
    for column, inv in zip(st.columns(3), rows[start : start + 3], strict=False):
        with column.container(border=True):
            st.markdown(f"**{inv['categoria']}**")
            st.caption(f"{inv['id']} · {inv['ambiente']} · {inv['tipo_evidencia']}")
            count = (
                db.query(f'SELECT count(*) FROM "{inv["tabela"]}"').item() if inv["tabela"] in tables else 0
            )
            st.metric(UNITS.get(inv["id"], "Linhas"), count)
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
            page, params = ui.study_link(inv)
            st.page_link(page, label="Abrir", icon=":material/arrow_forward:", query_params=params)

if "v_extincao_c12_comparacao" in tables:
    with st.container(border=True):
        st.markdown(":material/compare_arrows: **Comparação disponível: PSI-117 × CFI**")
        st.caption(
            "Diâmetro de extinção de gotas de n-dodecano por pressão: o modelo e as medições do PSI-117 (solo) "
            "ao lado dos ensaios de voo do CFI. Atenção: parte das medições do PSI-117 são ensaios do próprio CFI."
        )
        st.page_link("views/comparacao.py", label="Abrir comparação", icon=":material/arrow_forward:")

# o que falta para ter todas as tabelas
missing = []
if investigations.filter(pl.col("fonte_carregada").str.contains("(?i)amostra")).height:
    missing.append("**PSI-69 FLEX:** só a amostra de 34 ensaios; falta `FLEX.csv` (cerca de 274).")
if "psi117_tabelas" in tables:
    absent = db.query("SELECT arquivo FROM psi117_tabelas WHERE NOT presente_em_dados ORDER BY arquivo")[
        "arquivo"
    ]
    if absent.len():
        missing.append("**PSI-117:** o ReadMe da investigação lista tabelas que não estão em `dados/`: "
                       + ", ".join(f"`{a}.csv`" for a in absent) + ".")  # fmt: skip
if missing:
    with st.container(border=True):
        st.markdown(":material/playlist_add: **Para ter todas as tabelas**")
        st.markdown("\n".join(f"- {m}" for m in missing))
        st.caption("Baixe do portal NASA PSI, coloque em `dados/` e rode `uv run spaceapps-build`.")

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
