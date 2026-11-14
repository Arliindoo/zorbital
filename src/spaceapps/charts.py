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
SURFACE = {"light": "#fcfcfb", "dark": "#1a1a19"}

INK = {
    "light": {"primary": "#0b0b0b", "muted": "#898781", "grid": "#e1e0d9", "axis": "#c3c2b7"},
    "dark": {"primary": "#f0efec", "muted": "#898781", "grid": "#2c2c2a", "axis": "#383835"},
}
FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

# Categorias do domínio com cor fixa: a mesma categoria tem a mesma cor em toda página,
# e filtrar uma delas não repinta as outras.
DOMAIN_ORDER = {
    "desfecho": ["Extinção", "Queima completa", "Ruptura da gota"],
    "tipo_chama": ["Chama fria", "Chama quente"],
    "material_categoria": ["PMMA", "SIBAL (tecido)", "Não escrito na fonte", "Nomex (tecido)", "Cera (vela)"],
}


def domain_colors(column: str, mode: str = "light") -> dict[str, str]:
    return {value: SERIES[mode][i] for i, value in enumerate(DOMAIN_ORDER[column])}


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


def style(fig: go.Figure, mode: str = "light", *, height: int = 440, zero_y: bool = False) -> go.Figure:
    """Acabamento comum: fundo transparente, grade discreta, legenda em linha acima do gráfico."""
    ink = INK[mode]
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family=FONT, color=ink["primary"]),
        legend=dict(title_text="", orientation="h", yanchor="bottom", y=1.02, x=0),
        margin=dict(l=64, r=16, t=40, b=56),
        height=height,
        hoverlabel=dict(font_family=FONT),
    )
    axis = dict(tickfont_color=ink["muted"], title_font_color=ink["muted"], automargin=True)
    fig.update_xaxes(showgrid=False, linecolor=ink["axis"], **axis)
    fig.update_yaxes(
        gridcolor=ink["grid"], zeroline=False, rangemode="tozero" if zero_y else "normal", **axis
    )
    return fig


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
    palette = SERIES[mode]
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
    return style(fig, mode, zero_y=not ordered)


def scatter(
    table: pl.DataFrame,
    *,
    x: str,
    y: str,
    color: str,
    labels: dict[str, str],
    hover: list[str],
    mode: str = "light",
) -> go.Figure:
    """Dispersão com cor por categoria do domínio e anel da cor do fundo nos pontos sobrepostos."""
    fig = px.scatter(
        table,
        x=x,
        y=y,
        color=color,
        color_discrete_map=domain_colors(color, mode),
        category_orders={color: DOMAIN_ORDER[color]},
        labels=labels,
        hover_data=hover,
    )
    fig.update_traces(marker=dict(size=10, line=dict(width=2, color=SURFACE[mode]), opacity=0.9))
    return style(fig, mode)


def counts_bar(table: pl.DataFrame, *, category: str, value: str, mode: str = "light") -> go.Figure:
    """Barras horizontais de uma série só, maior em cima, com o valor na ponta."""
    data = table.sort(value)
    fig = px.bar(data, x=value, y=category, orientation="h", text=value, labels={category: ""})
    fig.update_traces(
        marker_color=SERIES[mode][0], marker_line_width=0, textposition="outside", cliponaxis=False
    )
    fig.update_layout(bargap=0.35, showlegend=False)
    style(fig, mode, height=max(220, 40 * data.height + 60))
    fig.update_layout(margin=dict(t=8, b=8))
    fig.update_xaxes(showticklabels=False, title_text="", linecolor="rgba(0,0,0,0)")
    return fig


def measured_vs_model(table: pl.DataFrame, comparison: pl.DataFrame, mode: str = "light") -> go.Figure:
    """Diâmetro de extinção por pressão: medição em pontos, modelo em linha tracejada e a faixa
    de incerteza informada como segmento vertical. A cor é o tipo de chama."""
    colors = domain_colors("tipo_chama", mode)
    fig = go.Figure()
    for flame in DOMAIN_ORDER["tipo_chama"]:
        color = colors[flame]
        band = comparison.filter(pl.col("tipo_chama") == flame).drop_nulls("limite_inferior_mm")
        if band.height:
            xs, ys = [], []
            for p, lo, hi in band.select(
                "pressao_atm", "limite_inferior_mm", "limite_superior_mm"
            ).iter_rows():
                xs += [p, p, None]
                ys += [lo, hi, None]
            fig.add_scatter(
                x=xs, y=ys, mode="lines", line=dict(color=color, width=10), opacity=0.22,
                name=f"{flame} · faixa informada", hoverinfo="skip",
            )  # fmt: skip
        rows = table.filter(pl.col("tipo_chama") == flame).sort("pressao_atm")
        model = rows.filter(pl.col("serie") == "Modelo")
        fig.add_scatter(
            x=model["pressao_atm"], y=model["diametro_extincao_mm"], mode="lines+markers",
            line=dict(color=color, width=2, dash="dash"), marker=dict(size=7, symbol="diamond"),
            name=f"{flame} · modelo", hovertemplate="%{x} atm · modelo %{y:.2f} mm<extra></extra>",
        )  # fmt: skip
        measured = rows.filter(pl.col("serie") == "Medição")
        fig.add_scatter(
            x=measured["pressao_atm"], y=measured["diametro_extincao_mm"], mode="markers",
            marker=dict(size=11, color=color, line=dict(width=2, color=SURFACE[mode])),
            name=f"{flame} · medição", hovertemplate="%{x} atm · medido %{y:.2f} mm<extra></extra>",
        )  # fmt: skip
    fig.update_layout(
        xaxis_title="Pressão (atm)", yaxis_title="Diâmetro de extinção (mm)", hovermode="closest"
    )
    return style(fig, mode, height=480, zero_y=True)
