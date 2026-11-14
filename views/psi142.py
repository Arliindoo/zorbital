"""PSI-142: limites de extinção de chamas frias em contrafluxo (Princeton), pontos de figuras publicadas."""

import polars as pl
import streamlit as st

from spaceapps import charts, db, ui
from spaceapps.assistant.screen import Screen

ui.require_db()
inv = db.investigation("PSI-142")
sets = db.query("SELECT * FROM psi142_conjuntos ORDER BY conjunto_id")
points = db.query("SELECT * FROM psi142_pontos")
mode = ui.theme()
ui.investigation_header(inv, points.height)


def label(row: dict) -> str:
    return f"{row['conjunto_id']} · {row['descricao_planilha'] or row['descricao_csv']}"


with st.sidebar:
    st.header("Conjunto")
    options = {label(r): r for r in sets.iter_rows(named=True)}
    chosen = options[st.radio("Conjunto de dados", list(options), label_visibility="collapsed")]

cid = chosen["conjunto_id"]
view = points.filter(pl.col("conjunto_id") == cid)
found = db.alerts("PSI-142").filter(pl.col("teste_id").str.contains(rf"conjuntos? (?:[\d, ]*\b{cid}\b)"))

st.subheader(label(chosen))
meta = st.columns([3, 2])
meta[0].markdown(f"**Artigo:** {chosen['publicacao'] or '—'}  \n**Figura:** {chosen['figura'] or '—'}")
if chosen["doi"]:
    meta[1].markdown(f"**DOI (CSV):** [{chosen['doi'].split('doi.org/')[-1]}]({chosen['doi']})")
if (chosen["descricao_csv"] or "") and chosen["descricao_csv"] != chosen["descricao_planilha"]:
    meta[1].caption(f"Descrição no CSV: {chosen['descricao_csv']}")
for alert in found.iter_rows(named=True):
    st.warning(f"{alert['detalhe']}  \n`{alert['valor_original']}`", icon=":material/warning:")

# séries com eixo suspeito (colunas trocadas na fonte) esticam o eixo e escondem as válidas: ficam de fora
# do gráfico por padrão, com aviso
suspect = {
    a.split(" · ", 1)[1]
    for a in found.filter(pl.col("tipo") == "eixo_suspeito")["teste_id"].to_list()
    if " · " in a
}
plotted = view
if suspect:
    show = st.toggle(
        f"Incluir no gráfico as séries com eixo suspeito ({', '.join(sorted(suspect))})", value=False
    )
    if not show:
        plotted = view.filter(~pl.col("serie").is_in(list(suspect)))
        st.caption(f"Fora do gráfico: {', '.join(sorted(suspect))}. Os pontos continuam na tabela abaixo.")

# um gráfico por grandeza no eixo y (o conjunto 5 mistura sinal de PLIF e temperatura)
for y_name in dict.fromkeys(plotted["y_nome"].to_list()):
    part = plotted.filter(pl.col("y_nome") == y_name).sort("serie", "x", maintain_order=True)
    x_name = part["x_nome"][0]
    profile = bool(part["x_nome"].str.contains("(?i)distance|location").any())
    st.plotly_chart(
        charts.xy_lines(
            part.sort(["serie", "x"]) if not profile else part,
            x="x",
            y="y",
            series="serie",
            x_title=x_name,
            y_title=y_name,
            mode=mode,
            markers=not profile,
        ),  # fmt: skip
        theme=None,
        width="stretch",
    )
st.caption(
    "Pontos digitalizados das figuras publicadas: a precisão é a da digitalização. "
    "Limites em contrafluxo são taxas de estiramento (1/s), não diâmetros de gota."
)

with st.expander(f"Pontos do conjunto ({view.height})"):
    st.dataframe(view.drop("fonte_arquivo"), hide_index=True, width="stretch")
with st.expander("Todos os conjuntos"):
    st.dataframe(sets.drop("fonte_arquivo"), hide_index=True, width="stretch")
ui.alerts_table("PSI-142")

ui.chat_widget(
    Screen(
        pagina="psi142",
        titulo=inv["nome"],
        investigacao="PSI-142",
        filtros={"conjunto": label(chosen)},
        graficos=[
            f"{y} em função de {view.filter(pl.col('y_nome') == y)['x_nome'][0]}, uma linha por série"
            for y in dict.fromkeys(view["y_nome"].to_list())
        ],  # fmt: skip
        dados=view.drop("fonte_arquivo"),
        tabela_banco="psi142_pontos",
    )
)
