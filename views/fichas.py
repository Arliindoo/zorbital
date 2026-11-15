"""Fichas lado a lado: o que de 2 a 4 estudos têm em comum, antes de comparar os resultados."""

import plotly.graph_objects as go
import polars as pl
import streamlit as st

from spaceapps import charts, db, fichas, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
mode = ui.theme()
studies = db.query("SELECT * FROM investigacoes")
existing = set(db.tables())
if "ficha" not in existing:
    st.error("O banco não tem a ficha dos estudos. Rode a carga de novo.")
    st.code("uv run spaceapps-build")
    st.stop()
sheet = db.query("SELECT * FROM ficha")
links = db.query("SELECT * FROM ficha_vinculos") if "ficha_vinculos" in existing else pl.DataFrame()
portal = db.query("SELECT * FROM metadados") if "metadados" in existing else None
names = {r["id"]: r["nome"].split(" — ")[0] for r in studies.iter_rows(named=True)}
ids_sorted = sorted(names, key=lambda i: int(i.split("-")[1]) if i.split("-")[-1].isdigit() else 10**6)


def short(inv_id: str) -> str:
    return inv_id if names[inv_id] == inv_id else f"{inv_id} · {names[inv_id]}"


VEREDITO = {  # cor e ícone: o texto do veredito vai junto, a cor nunca está sozinha
    "Janela comparável": ("green", ":material/check_circle:"),
    "Combustíveis diferentes": ("orange", ":material/warning:"),
    "Condições sem sobreposição": ("orange", ":material/block:"),
    "Sem condição numérica em comum": ("gray", ":material/help:"),
    "Nada medido em comum": ("gray", ":material/remove_circle:"),
}

st.title("Fichas lado a lado")
st.caption(
    "Antes de comparar resultados: o que os estudos testaram, em que faixas e o que mediram. "
    "Calculado das fichas, sem IA, tudo na mesma unidade."
)
default = [i for i in ("PSI-69", "PSI-39", "PSI-117") if i in names]
chosen = st.multiselect(
    "Estudos (de 2 a 4)", ids_sorted, default=default, format_func=short, max_selections=4, key="fichas:ids"
)
slots = charts.assign_slots(chosen, st.session_state.get("fichas:slots", {}))
st.session_state["fichas:slots"] = slots
color = {i: charts.SERIES[mode][slots[i]] for i in chosen}

result = fichas.compare(sheet, links, studies, chosen, portal) if len(chosen) >= 2 else None
plotted: list[tuple[str, go.Figure]] = []
if result is None:
    st.info("Escolha pelo menos dois estudos.", icon=":material/view_column:")
else:
    # --- veredito de cada par ---------------------------------------------------------------------
    st.subheader("O que dá para comparar")
    pairs = result["pares"]
    for start in range(0, len(pairs), 3):
        for column, par in zip(st.columns(3), pairs[start : start + 3], strict=False):
            with column.container(border=True, height="stretch"):
                tone, icon = VEREDITO.get(par.veredito, ("gray", ":material/help:"))
                st.markdown(f"**{short(par.a)} × {short(par.b)}**")
                st.markdown(f":{tone}-badge[{icon} {par.veredito}]")
                parts = [("Medem", ", ".join(par.grandezas_comuns).lower()),
                         ("Faixas em comum", "; ".join(par.sobrepoe)),
                         ("Sem sobreposição", "; ".join(par.nao_sobrepoe)),
                         ("Combustível em comum", ", ".join(par.combustiveis_comuns))]  # fmt: skip
                st.markdown(
                    "\n\n".join(f"**{title}:** {ui.md_escape(text)}" for title, text in parts if text) or "—"
                )
                for warning in par.avisos:
                    st.caption(f":material/info: {ui.md_escape(warning)}")
    if result["janelas_comuns"] and len(chosen) > 2:
        st.caption(
            "Faixa comum a todos os escolhidos: "
            + "; ".join(f"{k} {v}" for k, v in result["janelas_comuns"].items())
        )

    # --- faixas das condições ----------------------------------------------------------------------
    st.subheader("Faixas das condições")
    st.caption(
        "Cada linha vai do menor ao maior valor testado no estudo; um ponto só é valor fixo. A faixa "
        "sombreada é a comum a todos. Faixa comum não quer dizer que a mesma combinação foi testada."
    )
    for attr in fichas.NUMERICOS:
        found = fichas.ranges(sheet, attr)
        present = [i for i in chosen if i in found]
        if len(present) < 2:
            continue
        scale = fichas.ESCALA.get(attr, (1, None))[0]
        fig = go.Figure()
        for inv_id in reversed(present):  # o primeiro escolhido fica no topo
            lo, hi = (v * scale for v in found[inv_id])
            fig.add_trace(go.Scatter(
                x=[lo, hi], y=[short(inv_id)] * 2, mode="lines+markers", name=short(inv_id),
                line=dict(color=color[inv_id], width=4),
                marker=dict(size=10, color=color[inv_id], line=dict(width=2, color=charts.SURFACE[mode])),
                hovertemplate=f"{short(inv_id)}<br>{fichas.label(attr)}: "
                f"{fichas.range_text(attr, found[inv_id])}<extra></extra>",
            ))  # fmt: skip
        window = fichas.common_window([found[i] for i in present])
        if window and window[1] > window[0]:  # largura zero viraria uma linha parecida com o eixo
            fig.add_vrect(x0=window[0] * scale, x1=window[1] * scale, fillcolor=charts.INK[mode]["grid"],
                          opacity=0.6, line_width=0, layer="below")  # fmt: skip
        fig = charts.style(fig, mode, height=80 + 44 * len(present))
        fig.update_layout(showlegend=False, margin=dict(l=16, r=16, t=16, b=40))
        fig.update_xaxes(title_text=f"{fichas.label(attr)} ({fichas.unit(attr)})", showgrid=True,
                         gridcolor=charts.INK[mode]["grid"])  # fmt: skip
        fig.update_yaxes(showgrid=False)
        plotted.append((attr, fig))
    if not plotted:
        st.caption("Nenhuma condição numérica aparece em mais de um dos estudos escolhidos.")
    for start in range(0, len(plotted), 2):
        for column, (attr, fig) in zip(st.columns(2), plotted[start : start + 2], strict=False):
            column.plotly_chart(fig, theme=None, width="stretch", key=f"faixa:{attr}")

    # --- tabela ------------------------------------------------------------------------------------
    st.subheader("Ficha comparada")
    st.caption("Uma linha por atributo. “—”: o estudo não registra esse atributo nos dados carregados.")
    table = result["tabela"]
    st.dataframe(
        table, hide_index=True, width="stretch",
        column_config={"atributo": st.column_config.TextColumn("Atributo", pinned=True),
                       **{i: st.column_config.TextColumn(short(i)) for i in chosen}},
    )  # fmt: skip

ui.chat_widget(
    Screen(
        pagina="fichas", titulo="Fichas lado a lado", escopo=chosen or None,
        filtros={"estudos": chosen},
        graficos=[f"Faixas de {fichas.label(a)} por estudo" for a, _ in plotted],
        dados=result["tabela"] if result else None, tabela_banco="ficha",
    )
)  # fmt: skip
