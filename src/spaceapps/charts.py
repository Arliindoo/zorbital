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
    # gotas: o n-dodecano tem a mesma cor no CFI, no PSI-117 e na comparação
    "combustivel": [
        "n-dodecano", "n-dodecano/iso-dodecano 75/25", "n-dodecano/iso-dodecano 60/40", "Farnesano",
        "n-heptano", "n-decano",
    ],
}  # fmt: skip


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


def xy_lines(
    table: pl.DataFrame, *, x: str, y: str, series: str, x_title: str, y_title: str,
    mode: str = "light", markers: bool = True, height: int = 420,
) -> go.Figure:  # fmt: skip
    """Uma linha por série, na ordem em que as séries aparecem (cor fixa por posição)."""
    names = list(dict.fromkeys(table[series].to_list()))[:MAX_SERIES]
    colors = {name: SERIES[mode][i] for i, name in enumerate(names)}
    fig = go.Figure()
    for name in names:
        part = table.filter(pl.col(series) == name)
        fig.add_scatter(
            x=part[x], y=part[y], name=str(name), mode="lines+markers" if markers else "lines",
            line=dict(color=colors[name], width=2), marker=dict(size=7, line=dict(width=1.5, color=SURFACE[mode])),
            hovertemplate=f"{name}<br>{x_title}: %{{x:.4g}}<br>{y_title}: %{{y:.4g}}<extra></extra>",
        )  # fmt: skip
    fig.update_layout(xaxis_title=x_title, yaxis_title=y_title, hovermode="closest")
    return style(fig, mode, height=height)


def c12_comparison(cfi: pl.DataFrame, psi: pl.DataFrame, mode: str = "light") -> go.Figure:
    """Diâmetro de extinção por pressão, um painel por tipo de chama.

    `cfi`: um ensaio por linha (tipo_chama, pressao_atm, dext_mm, teste_id, d0_mm).
    `psi`: v_psi117_comparacao (medido, modelo e faixa por pressão).
    """
    from plotly.subplots import make_subplots

    palette = SERIES[mode]
    flames = ["Chama quente", "Chama fria"]
    fig = make_subplots(rows=1, cols=2, subplot_titles=flames, horizontal_spacing=0.1)
    for col, flame in enumerate(flames, start=1):
        first = col == 1
        tests = cfi.filter(pl.col("tipo_chama") == flame).drop_nulls("dext_mm")
        median = (
            tests.group_by("pressao_atm")
            .agg(pl.col("dext_mm").median(), pl.len().alias("n"))
            .sort("pressao_atm")
        )
        ref = psi.filter(pl.col("tipo_chama") == flame).sort("pressao_atm")
        band = ref.drop_nulls("limite_inferior_mm")
        if band.height:
            xs, ys = [], []
            for p, lo, hi in band.select(
                "pressao_atm", "limite_inferior_mm", "limite_superior_mm"
            ).iter_rows():
                xs += [p, p, None]
                ys += [lo, hi, None]
            fig.add_scatter(x=xs, y=ys, mode="lines", line=dict(color=palette[1], width=10), opacity=0.22,
                            name="PSI-117 · faixa informada", legendgroup="faixa", showlegend=True,
                            hoverinfo="skip", row=1, col=col)  # fmt: skip
        fig.add_scatter(
            x=tests["pressao_atm"], y=tests["dext_mm"], mode="markers", name="CFI · ensaio (ISS)",
            legendgroup="cfi", showlegend=first, opacity=0.55,
            marker=dict(size=8, color=palette[0], line=dict(width=1.5, color=SURFACE[mode])),
            customdata=tests.select("teste_id", "d0_mm").rows(),
            hovertemplate="CFI %{customdata[0]} · %{x} atm<br>"
            "Dext %{y:.3f} mm · D0 %{customdata[1]:.2f} mm<extra></extra>",
            row=1, col=col,
        )  # fmt: skip
        # só marcadores: as pressões são condições separadas, e com poucos ensaios uma linha sugeriria
        # uma tendência que os dados não sustentam. O n de cada mediana vai no tooltip.
        fig.add_scatter(
            x=median["pressao_atm"], y=median["dext_mm"], mode="markers", name="CFI · mediana",
            legendgroup="mediana", showlegend=first, customdata=median["n"],
            marker=dict(size=11, symbol="square", color=palette[0], line=dict(width=2, color=SURFACE[mode])),
            hovertemplate="CFI mediana %{x} atm: %{y:.3f} mm (n = %{customdata})<extra></extra>",
            row=1, col=col,
        )  # fmt: skip
        fig.add_scatter(
            x=ref["pressao_atm"], y=ref["medido_mm"], mode="markers", name="PSI-117 · medição",
            legendgroup="medido", showlegend=first,
            marker=dict(size=12, symbol="diamond", color=palette[1], line=dict(width=2, color=SURFACE[mode])),
            hovertemplate="PSI-117 medido %{x} atm: %{y:.2f} mm<extra></extra>", row=1, col=col,
        )  # fmt: skip
        fig.add_scatter(
            x=ref["pressao_atm"], y=ref["modelo_mm"], mode="lines", name="PSI-117 · modelo",
            legendgroup="modelo", showlegend=first, line=dict(color=palette[2], width=2, dash="dash"),
            hovertemplate="PSI-117 modelo %{x} atm: %{y:.2f} mm<extra></extra>", row=1, col=col,
        )  # fmt: skip
    style(fig, mode, height=500, zero_y=True)
    # legenda embaixo: em cima ela cobriria os títulos dos painéis
    fig.update_layout(legend=dict(orientation="h", yanchor="top", y=-0.2, x=0), margin=dict(t=48, b=110))
    fig.update_xaxes(title_text="Pressão (atm)")
    fig.update_yaxes(title_text="Diâmetro de extinção (mm)", row=1, col=1)
    fig.update_annotations(font=dict(color=INK[mode]["primary"], size=14))
    # legenda única para os dois painéis (a faixa só existe no da chama fria)
    seen = set()
    for trace in fig.data:
        trace.showlegend = trace.legendgroup not in seen
        seen.add(trace.legendgroup)
    return fig


def measured_model_by_fuel(table: pl.DataFrame, *, x: str, y: str, x_title: str, y_title: str,
                           mode: str = "light", height: int = 380) -> go.Figure:  # fmt: skip
    """Cor = combustível (a mesma em todas as páginas); medição em pontos, modelo em linha tracejada.
    Medições não são ligadas: cada ponto é uma gota diferente."""
    colors = domain_colors("combustivel", mode)
    fig = go.Figure()
    for fuel in [f for f in DOMAIN_ORDER["combustivel"] if f in set(table["combustivel"])]:
        part = table.filter(pl.col("combustivel") == fuel)
        model = part.filter(pl.col("serie") == "Modelo").sort(x)
        measured = part.filter(pl.col("serie") == "Medição")
        fig.add_scatter(
            x=model[x], y=model[y], mode="lines", name=f"{fuel} · modelo", legendgroup=fuel,
            line=dict(color=colors[fuel], width=2, dash="dash"),
            hovertemplate=f"{fuel} modelo<br>{x_title}: %{{x:.3g}}<br>{y_title}: %{{y:.3g}}<extra></extra>",
        )  # fmt: skip
        fig.add_scatter(
            x=measured[x], y=measured[y], mode="markers", name=f"{fuel} · medição", legendgroup=fuel,
            marker=dict(size=10, color=colors[fuel], line=dict(width=2, color=SURFACE[mode])),
            hovertemplate=f"{fuel} medido<br>{x_title}: %{{x:.3g}}<br>{y_title}: %{{y:.3g}}<extra></extra>",
        )  # fmt: skip
    fig.update_layout(xaxis_title=x_title, yaxis_title=y_title, hovermode="closest")
    return style(fig, mode, height=height)
