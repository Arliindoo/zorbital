"""Estudos: todos em cartões, com busca; e a página genérica de cada estudo enviado (?estudo=PSI-XX)."""

import re

import plotly.express as px
import polars as pl
import streamlit as st

from spaceapps import charts, db, search, ui
from spaceapps.assistant.screen import Screen
from spaceapps.ingest import ficha

ui.require_db()
mode = ui.theme()
studies = db.query("SELECT * FROM investigacoes ORDER BY id")
alerts = db.query("SELECT investigacao, count(*) AS n FROM alertas GROUP BY 1")
alert_count = dict(alerts.iter_rows())
existing = set(db.tables())
sheet = db.query("SELECT * FROM ficha ORDER BY ordem") if "ficha" in existing else pl.DataFrame()


def _names(values: str | None) -> list[str]:
    """'n-decano (12), n-heptano (11)…' → ['n-decano', 'n-heptano']."""
    parts = re.split(r", (?![^(]*\))", (values or "").rstrip("…"))
    return [re.sub(r" \(\d+\)$", "", p).strip() for p in parts if p.strip()]


def _range(attr: str) -> dict[str, tuple[float, float]]:
    """Faixa de um atributo numérico em cada estudo (todas as colunas dele juntas)."""
    out: dict[str, tuple[float, float]] = {}
    if not sheet.height:
        return out
    common = ficha.ATRIBUTOS[attr][2]  # faixas em outra unidade (não convertidas) não entram
    for r in sheet.filter((pl.col("atributo") == attr) & (pl.col("unidade") == common)).iter_rows(named=True):
        if r["minimo"] is not None and r["maximo"] is not None:
            lo, hi = r["minimo"], r["maximo"]
        elif r["minimo"] is not None or r["maximo"] is not None:
            continue  # faixa aberta ("≥ 21%", de um documento): não entra no filtro por faixa
        else:  # do ReadMe, em texto: "0.1, 0.21"
            numbers = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", r["valores"] or "")]
            if not numbers:
                continue
            lo, hi = min(numbers), max(numbers)
        old = out.get(r["investigacao"])
        out[r["investigacao"]] = (min(lo, old[0]), max(hi, old[1])) if old else (lo, hi)
    return out


def _categories(attr: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    if sheet.height:
        for r in sheet.filter(pl.col("atributo") == attr).iter_rows(named=True):
            out.setdefault(r["investigacao"], []).extend(_names(r["valores"]))
    return out


oxygen, pressure = _range("oxigenio"), _range("pressao")
fuels, shapes = _categories("combustivel"), _categories("forma_amostra")


def _fmt(v: float) -> str:
    return f"{v:.3g}"


def tags(inv_id: str) -> list[str]:
    """Duas ou três etiquetas que resumem o estudo: combustível, O2 e pressão."""
    out = []
    names = [n for n in fuels.get(inv_id, []) if n.lower() != "não escrito na fonte"]
    if names:
        out.append(f":violet-badge[{ui.md_escape(', '.join(names[:2]))}{' …' if len(names) > 2 else ''}]")
    if inv_id in oxygen:
        lo, hi = (100 * v for v in oxygen[inv_id])
        out.append(f":gray-badge[O₂ {_fmt(lo)}{'' if lo == hi else '–' + _fmt(hi)}%]")
    if inv_id in pressure:
        lo, hi = pressure[inv_id]
        out.append(f":gray-badge[{_fmt(lo)}{'' if lo == hi else '–' + _fmt(hi)} atm]")
    return out


def range_filter(label: str, ranges: dict[str, tuple[float, float]], scale: float, unit: str, key: str):
    """Faixa escolhida (na unidade de tela) ou None se o filtro está aberto; estudos sem o dado saem do
    resultado só quando a faixa é estreitada."""
    if not ranges:
        return None
    lo = min(r[0] for r in ranges.values()) * scale
    hi = max(r[1] for r in ranges.values()) * scale
    chosen = st.slider(f"{label} ({unit})", lo, hi, (lo, hi), key=key)
    return None if chosen == (lo, hi) else (chosen[0] / scale, chosen[1] / scale)


def _overlaps(inv_id: str, ranges: dict, chosen: tuple[float, float] | None) -> bool:
    if chosen is None:
        return True
    r = ranges.get(inv_id)
    return r is not None and r[0] <= chosen[1] and r[1] >= chosen[0]


@st.cache_data(show_spinner=False)
def index_for(stamp: str) -> list[search.Entry]:
    """Índice de busca; refeito quando o banco muda (o carimbo vem do arquivo do banco)."""
    return search.build_index()


def hub() -> None:
    """Todos os estudos em cartões, com busca."""
    st.title("Estudos")
    st.caption(
        f"{studies.height} estudos · busque por nome, PSI, combustível, material, coluna ou condição "
        "(sem diferenciar acentos)."
    )
    query = st.text_input("Buscar", placeholder="ex.: n-dodecano, PMMA, chama fria, PSI-39, pressão",
                          label_visibility="collapsed", icon=":material/search:")  # fmt: skip
    categories = sorted(set(studies["categoria"]))
    chosen = st.pills("Categoria", categories, selection_mode="multi", label_visibility="collapsed")
    with st.expander("Filtrar por condição de teste", icon=":material/tune:"):
        st.caption(
            "Um estudo entra se a faixa dele cruza a faixa escolhida. Valores da ficha de cada estudo."
        )
        left, middle, right = st.columns(3)
        with left:
            o2 = range_filter("Oxigênio", oxygen, 100, "%", "hub:o2")
        with middle:
            atm = range_filter("Pressão", pressure, 1, "atm", "hub:atm")
        with right:
            shape_options = sorted({n for v in shapes.values() for n in v}, key=str.lower)
            picked_shapes = st.multiselect("Formato da amostra ou chama", shape_options, key="hub:forma",
                                           placeholder="Todos")  # fmt: skip
    found = search.search(index_for(ui.db_stamp()), query)
    rows = [
        r
        for r in studies.iter_rows(named=True)
        if r["id"] in found
        and (not chosen or r["categoria"] in chosen)
        and _overlaps(r["id"], oxygen, o2)
        and _overlaps(r["id"], pressure, atm)
        and (not picked_shapes or set(picked_shapes) & set(shapes.get(r["id"], [])))
    ]
    # ordem numérica do PSI: o BASS (26) fica ao lado do BASS-II (25)
    rows.sort(key=lambda r: int(r["id"].split("-")[1]) if r["id"].split("-")[-1].isdigit() else 10**6)
    if not rows:
        st.info(
            f"Nenhum estudo com “{query}” e esses filtros." if query else "Nenhum estudo com esses filtros.",
            icon=":material/search_off:",
        )
    cards = [*rows, None]  # o último cartão é o de enviar um estudo novo
    for start in range(0, len(cards), 3):
        for column, inv in zip(st.columns(3), cards[start : start + 3], strict=False):
            with column.container(border=True, height="stretch"):
                if inv is None:
                    st.markdown("**:material/add: Novo estudo**")
                    st.caption("Envie as tabelas e o documento de outra investigação do PSI.")
                    st.page_link("views/enviar.py", label="Enviar estudo", icon=":material/upload:")
                    continue
                card(inv, found[inv["id"]])


def card(inv: dict, hits: list[str]) -> None:
    sample = "amostra" in (inv["fonte_carregada"] or "").lower()
    badges = [":blue-badge[Enviado]" if inv.get("origem") == "envio" else "",
              ":orange-badge[Amostra]" if sample else ":green-badge[Completo]",
              f":gray-badge[{alert_count.get(inv['id'], 0)} alertas]"]  # fmt: skip
    st.markdown(f"**{inv['nome']}**")
    st.caption(f"{inv['id']} · {inv['categoria']} · {inv['ambiente']}")
    count = db.query(f'SELECT count(*) FROM "{inv["tabela"]}"').item() if inv["tabela"] in existing else 0
    st.markdown(" ".join(b for b in badges if b) + f" :gray-badge[{count} registros]")
    if found_tags := tags(inv["id"]):
        st.markdown(" ".join(found_tags))
    question = inv["pergunta"] or ""  # perguntas longas não esticam a linha de cartões
    st.caption(question if len(question) <= 160 else question[:157].rsplit(" ", 1)[0] + "…")
    if hits:
        st.caption(":material/search: encontrado em " + "; ".join(hits[:3]))
    page, params = ui.study_link(inv)
    st.page_link(page, label="Abrir", icon=":material/arrow_forward:", query_params=params)


chosen_id = st.query_params.get("estudo")
submitted = studies.filter(pl.col("origem") == "envio")
if chosen_id not in set(submitted["id"]):
    hub()
    st.stop()

# --- um estudo enviado ----------------------------------------------------------------------------
inv = submitted.filter(pl.col("id") == chosen_id).row(0, named=True)
st.button("Todos os estudos", icon=":material/arrow_back:", type="tertiary", on_click=st.query_params.clear)
dictionary = db.query("SELECT * FROM estudo_colunas WHERE investigacao = ?", [inv["id"]])
table_names = list(dict.fromkeys(dictionary["tabela"].to_list()))
with st.sidebar:
    table = st.selectbox("Tabela", table_names) if len(table_names) > 1 else table_names[0]

data = db.query(f'SELECT * FROM "{table}"')
cols = dictionary.filter(pl.col("tabela") == table)
ui.investigation_header(inv, data.height)

by_nature = {n: cols.filter(pl.col("natureza") == n)["coluna"].to_list() for n in set(cols["natureza"])}
conditions = by_nature.get("CONDICAO", [])
numeric = set(cols.filter(pl.col("tipo") == "numero")["coluna"].to_list())
measures = [c for n in ("MEDIDO", "SIMULADO", "DERIVADO") for c in by_nature.get(n, []) if c in numeric]
categorical = [c for c in conditions if c not in numeric and c in data.columns and data[c].n_unique() <= 30]

# filtros: um por condição
view = data
with st.sidebar:
    st.header("Filtros")
    for c in conditions:
        if c not in data.columns:
            continue
        if c in numeric:
            bounds = ui.range_filter(c, data[c], key=f"f:{table}:{c}")
            if bounds:
                view = view.filter(pl.col(c).is_between(*bounds) | pl.col(c).is_null())
        elif c in categorical:
            options = sorted(str(v) for v in data[c].drop_nulls().unique())
            chosen = st.multiselect(c, options, default=options, key=f"f:{table}:{c}")
            view = view.filter(pl.col(c).cast(pl.String).is_in(chosen) | pl.col(c).is_null())

st.metric("Registros no filtro", view.height)
chart_note = ""
if measures:
    pick = st.columns(3)
    y = pick[0].selectbox("Medida (y)", measures)
    x = pick[1].selectbox(
        "Em função de (x)", [c for c in conditions + measures if c != y and c in numeric] or measures
    )
    color = pick[2].selectbox("Cor", ["(nenhuma)", *categorical])
    unit = dict(zip(cols["coluna"], cols["unidade"], strict=True))
    plotted = view.drop_nulls([x, y])
    fig = px.scatter(
        plotted, x=x, y=y, color=None if color == "(nenhuma)" else color,
        labels={x: f"{x} ({unit.get(x) or '—'})", y: f"{y} ({unit.get(y) or '—'})"},
        color_discrete_sequence=charts.SERIES[mode],
        hover_data=[c for c in by_nature.get("IDENTIFICADOR", []) if c in plotted.columns],
    )  # fmt: skip
    fig.update_traces(marker=dict(size=10, line=dict(width=2, color=charts.SURFACE[mode])))
    st.plotly_chart(charts.style(fig, mode), theme=None, width="stretch")
    chart_note = f"Dispersão {x} (x) × {y} (y)" + (f", cor por {color}" if color != "(nenhuma)" else "")
elif categorical:
    group = st.selectbox("Contar registros por", categorical)
    counts = (
        view.group_by(group).len("registros").with_columns(pl.col(group).cast(pl.String).fill_null("(vazio)"))
    )
    st.caption("Este estudo não tem medidas numéricas: o gráfico conta registros, não compara resultados.")
    st.plotly_chart(
        charts.counts_bar(counts, category=group, value="registros", mode=mode), theme=None, width="stretch"
    )
    chart_note = f"Contagem de registros por {group}"

st.subheader("Dados aferidos")
st.caption(
    "O que cada coluna é, e de onde saiu essa interpretação. Inferências da IA só entram depois de confirmadas."
)
measured = pl.DataFrame(
    [
        {
            "coluna": r["coluna"], "natureza": r["natureza"], "unidade": r["unidade"], "descricao": r["descricao"],
            "origem": r["origem"], "confirmado": r["confirmado"],
            "evidencia": ui.evidence_label({"tipo": r["evidencia_tipo"], "arquivo": r["evidencia_arquivo"],
                                            "pagina": r["evidencia_pagina"], "trecho": r["evidencia_trecho"]}),
        }
        for r in cols.iter_rows(named=True)
    ]
)  # fmt: skip
st.dataframe(
    measured,
    hide_index=True,
    width="stretch",
    column_config={
        "origem": "Cabeçalho na fonte",
        "evidencia": st.column_config.TextColumn("De onde saiu", width="large"),
    },
)

st.subheader("Registros")
st.dataframe(view, hide_index=True, width="stretch")
if "estudo_sugestoes" in set(db.tables()):
    suggested = db.query(
        "SELECT * EXCLUDE (investigacao) FROM estudo_sugestoes WHERE investigacao = ?", [inv["id"]]
    )
    if suggested.height:
        with st.expander(
            f"Comparações sugeridas pela IA ({suggested.height})", icon=":material/compare_arrows:"
        ):
            st.caption(
                "Sugestões gravadas com o estudo, ainda não verificadas pelas regras de compatibilidade."
            )
            st.dataframe(suggested, hide_index=True, width="stretch")
ui.alerts_table(inv["id"])

ui.chat_widget(
    Screen(
        pagina="estudos", titulo=inv["nome"], investigacao=inv["id"],
        filtros={"tabela": table},
        graficos=[chart_note] if chart_note else [],
        dados=view.drop("fonte_arquivo", strict=False), tabela_banco=table,
    )
)  # fmt: skip
