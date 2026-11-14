"""Peças de interface repetidas entre as páginas."""

from __future__ import annotations

import logging

import polars as pl
import streamlit as st

from . import db
from .assistant import agent, provider, tools
from .assistant.screen import Screen

log = logging.getLogger(__name__)


def theme() -> str:
    return st.context.theme.type or "light"


def require_db() -> None:
    if not db.exists():
        st.error("O banco ainda não foi gerado.")
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
    with st.expander("O que não concluir destes dados", icon=":material/info:"):
        st.markdown(inv["cautelas"].replace(". ", ".\n\n"))
        links = [f"[Página NASA PSI]({inv['url_nasa']})"]
        if inv["relatorio"]:
            links.append(f"[Relatório técnico]({inv['relatorio']})")
        if inv["doi"]:
            links.append(f"DOI {inv['doi']}")
        st.markdown(" · ".join(links))


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
    "comparacao": [
        "O modelo do PSI-117 acompanha os voos do CFI?",
        "Por que isso não é validação independente?",
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


def range_filter(label: str, series: pl.Series, *, key: str, fmt: str = "%.2f") -> tuple[float, float] | None:
    values = series.drop_nulls()
    if values.is_empty():
        return None
    lo, hi = float(values.min()), float(values.max())
    if lo == hi:
        st.caption(f"{label}: {lo:g} em todos os registros")
        return lo, hi
    return st.slider(label, lo, hi, (lo, hi), key=key, format=fmt)
