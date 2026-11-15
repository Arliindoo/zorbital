"""Peças de interface repetidas entre as páginas."""

from __future__ import annotations

import logging

import polars as pl
import streamlit as st

from . import db
from .assistant import agent, provider, tools
from .assistant.screen import Screen

log = logging.getLogger(__name__)


# página de cada estudo do catálogo; os enviados abrem na página genérica de estudos
STUDY_PAGES = {"PSI-69": "views/flex.py", "PSI-25": "views/bass.py", "PSI-39": "views/cfi.py",
               "PSI-117": "views/psi117.py", "PSI-142": "views/psi142.py"}  # fmt: skip


def study_link(inv: dict) -> tuple[str, dict | None]:
    """Página e parâmetros da URL que abrem um estudo."""
    if inv["id"] in STUDY_PAGES:
        return STUDY_PAGES[inv["id"]], None
    return "views/estudos.py", {"estudo": inv["id"]}


def db_stamp() -> str:
    """Muda sempre que o banco é refeito: serve de chave para caches."""
    return f"{db.DB_PATH}:{db.DB_PATH.stat().st_mtime_ns}" if db.exists() else "sem banco"


def theme() -> str:
    return st.context.theme.type or "light"


def require_db() -> None:
    """Sem banco, monta a partir da seed versionada (primeira abertura de quem clonou o repositório)."""
    if db.exists():
        return
    from .ingest import seed

    if seed.exists():
        with st.spinner("Montando o banco a partir da seed…"):
            seed.load(db_path=db.DB_PATH)
        return
    st.error("O banco ainda não foi gerado e não há seed no repositório.")
    st.code("uv run spaceapps-build")
    st.stop()


def investigation_header(inv: dict, rows: int) -> None:
    st.title(inv["nome"])
    st.caption(
        f"{inv['id']} · {inv['categoria']} · {inv['ambiente']} · evidência {inv['tipo_evidencia'].lower()}"
    )
    st.markdown(f"**Pergunta que esta investigação responde:** {inv['pergunta']}")
    source = inv["fonte_carregada"] or "nenhuma"
    if "amostra" in source.lower():
        st.warning(
            f"Esta página mostra uma **amostra** ({rows} linhas), não a investigação completa. "
            f"Fonte: `{source}`. Veja a Visão geral para obter os dados completos.",
            icon=":material/warning:",
        )
    else:
        others = [f for f in (inv.get("fontes_carregadas") or "").split("; ") if f and f != source]
        st.caption(
            f"Fonte: `{source}` · {rows} linhas"
            + (f" · mais {len(others)} tabela(s) desta investigação" if others else "")
        )
    ficha_panel(inv["id"])
    about_panel(inv["id"])
    with st.expander("O que não concluir destes dados", icon=":material/info:"):
        st.markdown(inv["cautelas"].replace(". ", ".\n\n"))
        links = [f"[Página NASA PSI]({inv['url_nasa']})"]
        if inv["relatorio"]:
            links.append(f"[Relatório técnico]({inv['relatorio']})")
        if inv["doi"]:
            links.append(f"DOI {inv['doi']}")
        st.markdown(" · ".join(links))


MAX_LINKS_SHOWN = 3
MAX_PUBLICATIONS = 10
SITUACAO_BADGE = {"variou": "orange", "fixo": "gray", "medido": "blue", "simulado": "violet",
                  "documento": "violet", "divergente": "red",
                  "derivado": "violet", "digitalizado": "violet", "sem dados": "red"}  # fmt: skip
FICHA_COLUNAS = [("Combustíveis e amostras", ("combustivel", "amostra")), ("Condições de teste", ("condicao",)),
                 ("Medições e sensores", ("medicao", "sensor"))]  # fmt: skip


def md_escape(text: object) -> str:
    """Texto dos dados dentro de markdown do Streamlit, sem virar fórmula, negrito ou link."""
    out = str(text)
    for char in "\\$*_[]`~":
        out = out.replace(char, "\\" + char)
    return out


def ficha_panel(inv_id: str) -> None:
    """Ficha do estudo: o que foi testado, em que condições, o que se mediu, o que variou e o que ficou fixo."""
    sheet, links = db.ficha(inv_id)
    if not sheet.height:
        return
    with st.expander("Ficha do estudo", icon=":material/assignment:", expanded=True):
        varied = sheet.filter(pl.col("situacao") == "variou")["rotulo"].to_list()
        fixed = sheet.filter(pl.col("situacao") == "fixo")["rotulo"].to_list()
        summary = []
        if varied:
            summary.append("**Variou entre os testes:** " + ", ".join(md_escape(v) for v in varied))
        if fixed:
            summary.append("**Igual em todos:** " + ", ".join(md_escape(v) for v in fixed))
        written = sheet.filter(pl.col("situacao").is_in(["documento", "divergente"])
                               & pl.col("secao").is_in(["combustivel", "amostra", "condicao"]))  # fmt: skip
        if written.height:
            summary.append("**Segundo os documentos:** " + "; ".join(
                md_escape(f"{r['rotulo']} {r['valores']}") for r in written.iter_rows(named=True)))  # fmt: skip
        st.markdown("  \n".join(summary))
        for goal in sheet.filter(pl.col("secao") == "objetivo").iter_rows(named=True):
            st.markdown(f"**Objetivo (documento):** {md_escape(goal['valores'])}")
            st.caption(md_escape(goal["evidencia"]))
        st.caption(
            "Calculada dos dados carregados, sem IA; os itens marcados *documento* foram lidos dos documentos e "
            "aprovados na revisão. Abaixo de cada item, de onde ele saiu."
        )
        for column, (title, sections) in zip(st.columns(3), FICHA_COLUNAS, strict=True):
            with column:
                st.markdown(f"**{title}**")
                items = sheet.filter(pl.col("secao").is_in(sections))
                if not items.height:
                    st.caption("Nada registrado nos dados.")
                for item in items.iter_rows(named=True):
                    _ficha_item(item)
        if links.height:
            st.markdown("**Condições que não variaram de forma independente**")
            st.caption(
                "Algum nível de uma só aparece com um nível da outra: uma diferença nesses testes não pode "
                "ser atribuída a uma delas sozinha."
            )
            shown = links.head(MAX_LINKS_SHOWN)
            st.markdown("\n".join(
                f"- :orange[:material/link:] **{md_escape(link['variavel_a'])} × "
                f"{md_escape(link['variavel_b'])}**: {md_escape(link['exemplos'].split('; ')[0])}"
                for link in shown.iter_rows(named=True)
            ))  # fmt: skip
            if links.height > shown.height:
                rest = links.slice(shown.height)
                st.caption(
                    "Também: "
                    + "; ".join(
                        md_escape(f"{a} × {b}")
                        for a, b in zip(rest["variavel_a"], rest["variavel_b"], strict=True)
                    )
                    + ". O assistente detalha qualquer um deles."
                )


def period(meta: dict) -> str | None:
    """'08-01-2007' e '07-31-2016' (mês-dia-ano, como no portal) → '2007–2016'."""
    years = [d[-4:] for d in (meta.get("inicio"), meta.get("fim")) if d and d[-4:].isdigit()]
    return "–".join(dict.fromkeys(years)) or None


def about_panel(inv_id: str) -> None:
    """Objetivo, hipótese, abordagem, equipamento e publicações, dos metadados do portal NASA PSI."""
    meta, publications = db.metadata(inv_id)
    if meta is None:
        return
    with st.expander("Objetivo, equipamento e publicações", icon=":material/target:"):
        st.caption(
            f"Metadados do portal NASA PSI ({md_escape(meta['arquivo_metadados'])}), no idioma original."
        )
        facts = [(label, meta.get(key)) for label, key in (("Equipamento", "equipamento"),
                 ("Plataforma", "plataforma"), ("Centro", "centro_nasa"))]  # fmt: skip
        facts.append(("Período", period(meta)))
        st.markdown("  \n".join(f"**{label}:** {md_escape(value)}" for label, value in facts if value))
        for label, key in (("Objetivo", "objetivo"), ("Hipótese", "hipotese"), ("Abordagem", "abordagem")):
            if meta.get(key):
                st.markdown(f"**{label}**")
                st.markdown(md_escape(meta[key]).replace("\n", "  \n"))
        if publications.height:
            st.markdown(f"**Publicações ({publications.height})**")
            lines = []
            for pub in publications.head(MAX_PUBLICATIONS).iter_rows(named=True):
                link = pub["link"] or (f"https://doi.org/{pub['doi']}" if pub["doi"] else None)
                title = md_escape(pub["titulo"])
                lines.append(f"- [{title}]({link})" if link and link.startswith("http") else f"- {title}")
            st.markdown("\n".join(lines))
            if publications.height > MAX_PUBLICATIONS:
                st.caption(f"Mais {publications.height - MAX_PUBLICATIONS}; o assistente lista todas.")


def _ficha_item(item: dict) -> None:
    color = SITUACAO_BADGE.get(item["situacao"], "gray")
    unit = ""
    if item["unidade"] and item["minimo"] is not None:  # "não informada", "a conferir": não é unidade
        unit = f" (unidade {item['unidade']})" if item["unidade"] in ("não informada", "a conferir") else (
            f" {item['unidade']}"
        )  # fmt: skip
    value = md_escape(f"{item['valores']}{unit}") if item["valores"] else "—"
    st.markdown(f"{md_escape(item['rotulo'])} :{color}-badge[{item['situacao']}]  \n{value}")
    origin = item["evidencia"] if item["origem"] in ("dados", "documento") else item["origem"]
    note = f" · {item['nota']}" if item["nota"] else ""
    st.caption(md_escape(f"{origin}{note}"))


def alerts_table(inv_id: str) -> None:
    found = db.alerts(inv_id)
    label = f"Alertas de qualidade ({found.height})" if found.height else "Alertas de qualidade (nenhum)"
    with st.expander(label, icon=":material/rule:"):
        st.caption("Células que não puderam ser lidas como estão. Nada foi corrigido por suposição.")
        st.dataframe(found.drop("investigacao"), hide_index=True, width="stretch")


SUGGESTIONS = {
    "overview": ["Qual a diferença entre as três investigações?", "Quais arquivos eram repetidos?"],
    "flex": [
        "Explique o gráfico de condições testadas",
        "Por que alguns ensaios não aparecem no 2º gráfico?",
    ],
    "bass": ["Quais materiais foram mais testados?", "Quais testes têm alertas e por quê?"],
    "psi117": ["Em que pressões o modelo sai da faixa de incerteza?", "O que é uma chama fria?"],
    "cfi": ["Como a extinção da chama fria muda com a pressão?", "O que quer dizer Dext fria = 0 na fonte?"],
    "psi142": ["O que este conjunto mostra?", "Por que há alertas neste conjunto?"],
    "fichas": [
        "O que estes estudos têm em comum?",
        "Dá para comparar o diâmetro de extinção entre eles?",
    ],
    "comparacao": [
        "O modelo do PSI-117 acompanha os voos do CFI?",
        "Por que isso não é validação independente?",
    ],
    "estudos": [
        "O que este estudo mediu?",
        "Quais interpretações vieram do documento e quais foram inferidas?",
    ],
    "explore": ["O que este gráfico mostra?", "Qual série tem o maior valor?"],
}


OPEN_KEY = "assistente_aberto"  # vale para todas as páginas: o painel continua aberto ao navegar
DOCK_KEY = "assistente_lateral"  # expandido: fixo na lateral direita, com a altura toda da tela
DOCK_WIDTH = "clamp(360px, 34vw, 520px)"

# Cores do fundo e da borda do painel: as do tema padrão do Streamlit, para o painel parecer da página.
PANEL = {
    "light": {"bg": "#ffffff", "border": "rgba(49, 51, 63, 0.16)", "shadow": "rgba(15, 23, 42, 0.18)"},
    "dark": {"bg": "#171614", "border": "rgba(250, 250, 250, 0.16)", "shadow": "rgba(0, 0, 0, 0.55)"},
}


def _widget_css(docked: bool) -> None:
    colors = PANEL[theme()]
    css = f"""
        .st-key-assistente_botao, .st-key-assistente_painel {{
            position: fixed; right: 24px; bottom: 24px; z-index: 999990;
        }}
        .st-key-assistente_botao {{ width: auto !important; }}
        .st-key-assistente_botao button {{
            border-radius: 999px; padding: 0.55rem 1.1rem; box-shadow: 0 6px 20px {colors["shadow"]};
        }}
        .st-key-assistente_painel {{
            width: min(420px, calc(100vw - 32px)) !important; max-height: calc(100vh - 48px);
            background: {colors["bg"]}; border: 1px solid {colors["border"]}; border-radius: 16px;
            box-shadow: 0 16px 48px {colors["shadow"]}; padding: 12px 14px 14px; gap: 0.5rem;
        }}
        .st-key-assistente_lateral {{
            position: fixed; top: 0; right: 0; bottom: 0; z-index: 999991;
            width: {DOCK_WIDTH} !important; background: {colors["bg"]};
            border-left: 1px solid {colors["border"]}; padding: 14px 16px 16px; gap: 0.5rem;
            display: flex !important; flex-direction: column !important;
        }}
        /* expandido, a lista de mensagens ocupa o que sobra da altura. A altura fixa do Streamlit
           (height=380) está no invólucro da lista, não nela: por isso o :has(). */
        .st-key-assistente_lateral :has(> .st-key-assistente_mensagens) {{
            height: auto !important; flex: 1 1 0 !important; min-height: 0 !important;
        }}
        .st-key-assistente_lateral .st-key-assistente_mensagens {{ height: 100% !important; }}
        [data-testid="stChatMessage"] {{ padding: 0.5rem 0.25rem; }}
        @media (max-width: 640px) {{
            .st-key-assistente_botao, .st-key-assistente_painel {{ right: 16px; bottom: 16px; }}
            .st-key-assistente_lateral {{ width: 100vw !important; }}
        }}
        /* espaço no fim da página para o botão não cobrir o último conteúdo */
        [data-testid="stMainBlockContainer"] {{ padding-bottom: 6rem; }}
    """
    if docked:
        # a página encolhe para o painel não cobrir nada; no celular ele cobre a tela inteira
        css += f"""
        @media (min-width: 641px) {{
            [data-testid="stAppViewContainer"] {{ padding-right: {DOCK_WIDTH}; }}
        }}
        """
    st.markdown(f"<style>{css}</style>", unsafe_allow_html=True)


def side_by_side(spec: list[int] | int = 2) -> list:
    """Colunas lado a lado; com o assistente expandido na lateral, a página fica estreita demais
    para dois gráficos, e eles passam a ser empilhados."""
    if st.session_state.get(OPEN_KEY) and st.session_state.get(DOCK_KEY):
        return [st.container() for _ in range(spec if isinstance(spec, int) else len(spec))]
    return st.columns(spec)


def _set_open(value: bool) -> None:
    st.session_state[OPEN_KEY] = value


def _set_docked(value: bool) -> None:
    st.session_state[DOCK_KEY] = value


def chat_widget(screen: Screen) -> None:
    """Assistente no canto inferior direito, com o escopo da página.

    Fechado, é um botão. Aberto, é um painel flutuante que não fecha ao clicar na página, para dar para
    mexer nos filtros e no gráfico enquanto se conversa. Expandido, fica fixo na lateral direita com a
    altura toda, e a página encolhe para não ficar coberta. Aberto/expandido valem para todas as
    páginas; a conversa é guardada por página.
    """
    is_open = st.session_state.get(OPEN_KEY, False)
    docked = is_open and st.session_state.get(DOCK_KEY, False)
    _widget_css(docked)
    if not is_open:
        with st.container(key="assistente_botao", width="content"):
            st.button("Assistente", icon=":material/forum:", type="primary", key="assistente_abrir",
                      on_click=_set_open, args=(True,))  # fmt: skip
        return

    key = f"chat:{screen.pagina}"
    state = st.session_state.setdefault(key, {"api": [], "view": []})
    with st.container(key="assistente_lateral" if docked else "assistente_painel"):
        with st.container(horizontal=True, vertical_alignment="center", gap="small"):
            st.markdown("**:material/forum: Assistente**", width="stretch")
            if state["view"]:
                st.button("", icon=":material/delete_sweep:", type="tertiary", key=f"{key}:limpar",
                          help="Limpar conversa", on_click=st.session_state.__setitem__,
                          args=(key, {"api": [], "view": []}))  # fmt: skip
            st.button("", icon=":material/close_fullscreen:" if docked else ":material/open_in_full:",
                      type="tertiary", key="assistente_expandir",
                      help="Voltar a flutuar" if docked else "Expandir na lateral",
                      on_click=_set_docked, args=(not docked,))  # fmt: skip
            st.button("", icon=":material/close:", type="tertiary", key="assistente_fechar", help="Fechar",
                      on_click=_set_open, args=(False,))  # fmt: skip
        st.caption(f"{screen.titulo} · consulta: " + ", ".join(tools.PAGE_GROUPS[screen.pagina]))

        messages = st.container(height=380, autoscroll=True, border=False, key="assistente_mensagens")
        with messages:
            for message in state["view"]:
                with st.chat_message(message["role"]):
                    if message.get("tools"):
                        st.caption(":material/search: " + " · ".join(message["tools"]))
                    st.markdown(message["text"])
            picked, suggestions = None, st.empty()
            if not state["view"]:
                with suggestions.container():
                    st.caption("Pergunte sobre o que está na tela, por exemplo:")
                    picked = st.pills("Sugestões", SUGGESTIONS[screen.pagina], key=f"{key}:sugestao",
                                      label_visibility="collapsed")  # fmt: skip

        typed = st.chat_input("Pergunte sobre os dados desta tela", key=f"{key}:input")
        question = typed or picked
        if not question:
            return
        suggestions.empty()
        with messages:
            _answer(screen, state, question)


def _answer(screen: Screen, state: dict, question: str) -> None:
    with st.chat_message("user"):
        st.markdown(question)
    with st.chat_message("assistant"):
        used, text = [], ""
        caption, area = st.empty(), st.empty()
        history = list(state["api"])  # só grava no estado se o turno terminar bem
        try:
            for item in agent.answer(screen, history, question):
                if isinstance(item, agent.ToolUse):
                    used.append(agent.describe_call(item))
                    caption.caption(":material/search: " + " · ".join(used))
                elif isinstance(item, agent.Done):
                    if (cost := (item.usage or {}).get("custo_zyt")) is not None:
                        used.append(f"{cost:g} ZYT")
                        caption.caption(":material/search: " + " · ".join(used))
                else:
                    text += item
                    area.markdown(text + "▌")
        except provider.ProviderError as error:
            area.empty()
            st.error(str(error), icon=":material/error:")
            return
        except Exception as error:  # nenhuma falha pode deixar o painel mudo
            log.exception("Falha inesperada no assistente")
            area.empty()
            st.error(f"Erro inesperado no assistente ({type(error).__name__}). Detalhes no log do servidor.",
                     icon=":material/error:")  # fmt: skip
            return
        area.markdown(text)
    state["api"] = history
    state["view"] += [{"role": "user", "text": question}, {"role": "assistant", "text": text, "tools": used}]


def evidence_label(evidence: dict | None) -> str:
    """De onde saiu uma interpretação: "documento · relatorio.pdf p. 4 · "trecho"", "cabeçalho" ou "inferido"."""
    evidence = evidence or {}
    kind = evidence.get("tipo") or "inferido"
    if kind == "documento":
        where = " ".join(
            x
            for x in (
                evidence.get("arquivo") or "",
                f"p. {evidence['pagina']}" if evidence.get("pagina") else "",
            )
            if x
        )
        quote = f' · "{evidence["trecho"]}"' if evidence.get("trecho") else ""
        return f"documento · {where}{quote}"
    return {"cabecalho": "cabeçalho da tabela", "inferido": "inferido pela IA"}.get(kind, kind)


def range_filter(label: str, series: pl.Series, *, key: str, fmt: str = "%.2f") -> tuple[float, float] | None:
    values = series.drop_nulls()
    if values.is_empty():
        return None
    lo, hi = float(values.min()), float(values.max())
    if lo == hi:
        st.caption(f"{label}: {lo:g} em todos os registros")
        return lo, hi
    return st.slider(label, lo, hi, (lo, hi), key=key, format=fmt)
