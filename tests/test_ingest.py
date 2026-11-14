"""A carga: categorias, alertas e a escolha entre arquivos repetidos."""

import duckdb
import polars as pl
import pytest

from spaceapps.ingest.bass import classify_material


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("100 micron pmma film, 2 cm wide", {"material_categoria": "PMMA", "geometria": "Filme", "espessura_mm": 0.1, "largura_cm": 2.0}),
        ("2 cm, 4 mm 1 sided pmma slab", {"geometria": "Placa", "espessura_mm": 4.0, "faces_queimando": 1}),
        ('3/8"clear rod', {"material_categoria": "Não escrito na fonte", "geometria": "Haste", "diametro_mm": 9.53, "cor": "Transparente"}),
        ("1/4 blac rod", {"diametro_mm": 6.35, "cor": "Preta"}),
        ('0.5" black rod', {"diametro_mm": 12.7}),
        ("SIBAL 2 cm", {"material_categoria": "SIBAL (tecido)", "geometria": "Tecido", "largura_cm": 2.0}),
        ("Japan Wax candle", {"material_categoria": "Cera (vela)", "geometria": "Vela"}),
        ("4 cm spherical section", {"geometria": "Seção esférica", "diametro_mm": 40.0}),
    ],
)  # fmt: skip
def test_material_text_becomes_categories(text, expected):
    result = classify_material(text)
    for key, value in expected.items():
        assert (
            result[key] == pytest.approx(value, abs=0.01)
            if isinstance(value, float)
            else result[key] == value
        )


def q(path, sql):
    with duckdb.connect(str(path), read_only=True) as con:
        return pl.from_arrow(con.sql(sql).to_arrow_table())


def test_each_investigation_lands_in_its_own_table(built_db):
    assert q(built_db, "SELECT count(*) n FROM bass_ensaios").item() == 5
    assert q(built_db, "SELECT count(*) n FROM flex_ensaios").item() == 4
    psi = q(built_db, "SELECT * FROM psi117_extincao")
    assert set(psi["natureza"]) == {"MEDIDO", "SIMULADO", "INCERTEZA"}
    assert psi.filter((pl.col("serie") == "Medição") & (pl.col("tipo_chama") == "Chama fria")).height == 4


def test_exact_duplicate_is_detected_and_not_loaded(built_db):
    sources = q(built_db, "SELECT caminho, status, duplicata_de FROM fontes").rows_by_key(
        "caminho", named=True
    )
    assert sources["BASS-II Test Matrix by PI Final.xlsx"][0]["status"] == "Carregado"
    assert sources["Zorbital/copia.xlsx"][0]["status"] == "Duplicata exata"
    assert sources["Zorbital/LEIA_PRIMEIRO.md"][0]["status"] == "Documentação"


def test_unreadable_cells_become_alerts_not_guesses(built_db):
    alerts = q(built_db, "SELECT teste_id, campo, valor_original, tipo FROM alertas")
    found = set(alerts.select("teste_id", "tipo").iter_rows())
    assert ("O4", "valor_nao_numerico") in found  # "OR" no CO final
    assert ("O1", "valor_negativo") in found  # CO inicial -1
    assert ("B2", "variacao_extrema") in found  # O2 de 22,2 para 1,6
    assert ("T9", "data_suspeita") in found  # 2018 numa campanha de 2014
    assert ("Chama fria 1 atm", "medicao_repetida") in found
    assert q(built_db, "SELECT co_final_ppm FROM bass_ensaios WHERE teste_id = 'O4'").item() is None


def test_comparison_view_keeps_measured_and_model_apart(built_db):
    view = q(
        built_db, "SELECT * FROM v_psi117_comparacao WHERE tipo_chama = 'Chama fria' AND pressao_atm = 1"
    )
    row = view.row(0, named=True)
    assert row["n_medicoes"] == 2
    assert row["medido_mm"] == pytest.approx((0.39 + 0.48) / 2)
    assert row["modelo_mm"] == 0.25
