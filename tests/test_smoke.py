"""Testes de fumaça: o ambiente está montado e o app sobe sem erro."""

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from spaceapps import ai, charts, data

APP = str(Path(__file__).parent.parent / "app.py")


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


def test_large_table_is_summarized_not_truncated():
    df = data.load_example()
    countries = df["country"].unique().sort().to_list()[:40]
    table = data.compare(df, by="country", entities=countries, x="year", measure="pop")
    summary = data.summarize(table, by="country", x="year", measure="pop")

    context, sent_full = ai.build_context(
        df, table, summary, by="country", x="year", measure="pop", agg="média"
    )

    assert table.height > ai.MAX_TABLE_ROWS
    assert not sent_full
    assert "não foi enviada" in context


def test_app_renders_with_the_example_dataset():
    app = AppTest.from_file(APP, default_timeout=60).run()

    assert not app.exception
    assert app.title[0].value == "Análise de dados"
