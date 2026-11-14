"""Testes de fumaça: cálculos de comparação e todas as páginas sobem sem erro."""

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from spaceapps import charts, data

ROOT = Path(__file__).parent.parent
PAGES = [
    "views/overview.py", "views/flex.py", "views/bass.py", "views/psi117.py", "views/cfi.py",
    "views/psi142.py", "views/comparacao.py", "views/explore.py",
]  # fmt: skip


def test_compare_aggregates_per_entity_and_x():
    df = data.load_example()
    table = data.compare(df, by="continent", entities=["Asia", "Europe"], x="year", measure="lifeExp")

    assert set(table["continent"]) == {"Asia", "Europe"}
    assert table.height == df["year"].n_unique() * 2


def test_colors_follow_the_entity_when_the_filter_changes():
    slots = charts.assign_slots(["Brazil", "Chile", "Peru"], {})
    after = charts.assign_slots(["Brazil", "Peru", "Cuba"], slots)

    assert after["Brazil"] == slots["Brazil"]
    assert after["Peru"] == slots["Peru"]
    assert after["Cuba"] == slots["Chile"]  # herda a cor que ficou livre


def test_more_series_than_colors_is_refused():
    with pytest.raises(ValueError):
        charts.assign_slots([str(i) for i in range(charts.MAX_SERIES + 1)], {})


def open_page(page: str) -> AppTest:
    """Abre pelo app.py e troca de página, como o usuário: st.page_link só existe dentro da navegação."""
    app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=60).run()
    return app.switch_page(page).run()


@pytest.mark.parametrize("page", PAGES)
def test_page_renders(page, use_db):
    app = open_page(page)

    assert not app.exception, [e.value for e in app.exception]
    assert app.title


def test_navigation_opens_on_overview(use_db):
    app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=60).run()

    assert not app.exception
    assert app.title[0].value == "Combustão em microgravidade"


def test_chat_without_zyria_config_explains_what_is_missing(use_db):
    app = open_page("views/psi117.py")
    app.button(key="assistente_abrir").click().run()
    app.chat_input[0].set_value("O que é chama fria?").run()

    assert not app.exception
    assert "ZYRIA_BASE_URL" in app.error[0].value


def test_assistant_starts_closed_and_stays_open_until_closed(use_db):
    app = open_page("views/flex.py")
    assert not app.chat_input  # fechado: só o botão
    assert app.button(key="assistente_abrir")

    app.button(key="assistente_abrir").click().run()
    assert app.chat_input and app.session_state["assistente_aberto"]
    app.multiselect[0].set_value(["Extinção"]).run()  # mexer num filtro não fecha o painel
    assert app.chat_input

    app.button(key="assistente_fechar").click().run()
    assert not app.chat_input


def test_assistant_can_dock_to_the_side_and_back(use_db):
    app = open_page("views/bass.py")
    app.button(key="assistente_abrir").click().run()
    app.button(key="assistente_expandir").click().run()
    assert app.session_state["assistente_lateral"] and app.chat_input

    app.multiselect[0].set_value(["Olson"]).run()  # expandido também não fecha ao mexer na página
    assert app.session_state["assistente_lateral"] and app.chat_input

    app.button(key="assistente_expandir").click().run()
    assert not app.session_state["assistente_lateral"] and app.chat_input
