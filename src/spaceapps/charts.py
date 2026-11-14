"""Gráficos e o sistema de cores do dashboard."""

from __future__ import annotations

import plotly.express as px
import plotly.graph_objects as go
import polars as pl

# Paleta categórica em ordem fixa: a ordem é o que garante a separação para
# daltônicos entre séries vizinhas, então não reordene nem gere um nono tom.
SERIES = {
    "light": ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    "dark": ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"],
}
MAX_SERIES = len(SERIES["light"])

INK = {
    "light": {"primary": "#0b0b0b", "muted": "#898781", "grid": "#e1e0d9", "axis": "#c3c2b7"},
    "dark": {"primary": "#f0efec", "muted": "#898781", "grid": "#2c2c2a", "axis": "#383835"},
}


def assign_slots(entities: list[str], slots: dict[str, int]) -> dict[str, int]:
    """A cor segue a entidade: quem já tem cor mantém, quem entra pega a menor livre.

    Assim, tirar uma série do filtro não repinta as que ficaram.
    """
    if len(entities) > MAX_SERIES:
        raise ValueError(f"No máximo {MAX_SERIES} séries por gráfico.")
    kept = {e: s for e, s in slots.items() if e in entities}
    free = [i for i in range(MAX_SERIES) if i not in kept.values()]
    for entity in entities:
        if entity not in kept:
            kept[entity] = free.pop(0)
    return kept


def comparison_chart(
    table: pl.DataFrame,
    *,
    x: str,
    measure: str,
    by: str,
    slots: dict[str, int],
    ordered: bool,
    mode: str = "light",
) -> go.Figure:
    """Linhas quando x é ordenado (tempo, número); barras agrupadas quando é categoria."""
    palette, ink = SERIES[mode], INK[mode]
    common = dict(
        x=x,
        y=measure,
        color=by,
        color_discrete_map={entity: palette[slot] for entity, slot in slots.items()},
        category_orders={by: sorted(slots, key=slots.get)},
    )
    if ordered:
        fig = px.line(table, **common)
        fig.update_traces(line_width=2)
        fig.update_layout(hovermode="x unified")
    else:
        fig = px.bar(table, barmode="group", **common)
        fig.update_traces(marker_line_width=0)
        fig.update_layout(bargap=0.3, bargroupgap=0.08)

    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family='system-ui, -apple-system, "Segoe UI", sans-serif', color=ink["primary"]),
        legend=dict(title_text="", orientation="h", yanchor="bottom", y=1.02, x=0),
        margin=dict(l=64, r=16, t=40, b=56),
        height=440,
    )
    fig.update_xaxes(
        showgrid=False,
        linecolor=ink["axis"],
        tickfont_color=ink["muted"],
        title_font_color=ink["muted"],
        automargin=True,
    )
    fig.update_yaxes(
        gridcolor=ink["grid"],
        zeroline=False,
        tickfont_color=ink["muted"],
        title_font_color=ink["muted"],
        rangemode="tozero" if not ordered else "normal",
        automargin=True,
    )
    return fig
