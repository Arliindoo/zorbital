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


# --- Arquivos do portal oficial, CFI, PSI-117 completo e PSI-142 ----------------------------------


def test_portal_prefixes_are_recognized():
    from spaceapps.ingest.catalog import canonical_name

    assert canonical_name("PSI-117_Analyzed Data_ReadMe_List_of_Data.xlsx") == "ReadMe_List_of_Data.xlsx"
    assert canonical_name("PSI-39_Experimental table_CFI.csv") == "CFI.csv"
    assert (
        canonical_name("PSI data summary Princeton with links.xlsx")
        == "PSI data summary Princeton with links.xlsx"
    )


def test_official_file_wins_over_package_copy(built_db):
    inv = q(built_db, "SELECT fonte_carregada FROM investigacoes WHERE id = 'PSI-117'").item()
    assert inv == "PSI-117_Analyzed Data_PROCI_2023_C12_Extinction_Diameter_vs_pressure.csv"
    copy = q(
        built_db, "SELECT motivo FROM fontes WHERE nome = '03_PSI117_extincao_C12_arquivo_referencia.csv'"
    ).item()
    assert "Coberto por PSI-117_Analyzed Data_PROCI_2023_C12" in copy


def test_cfi_joins_all_sheets_and_keeps_zero_out_of_the_measurements(built_db):
    tests = q(built_db, "SELECT * FROM cfi_ensaios").rows_by_key("teste_id", named=True, unique=True)
    assert set(tests) == {"1206", "1251", "1240", "1300", "1274A"}  # espaço do id removido
    assert tests["1240"]["pressao_atm"] == 0.5 and tests["1240"]["pressao_texto_fonte"] == ".5 atm"
    assert tests["1300"]["dext_fria_mm"] is None and tests["1300"]["dext_fria_zero_na_fonte"]
    assert (
        tests["1274A"]["diluente"] == "Hélio"
        and tests["1274A"]["combustivel"] == "n-dodecano/iso-dodecano 75/25"
    )
    assert tests["1206"]["ignicao_potencia_w"] == 12 and tests["1206"]["comentario"] == "Good burn."
    found = set(q(built_db, "SELECT teste_id, tipo FROM alertas WHERE investigacao = 'PSI-39'").iter_rows())
    assert ("1300", "valor_zero") in found and ("1274A", "espacos_no_id") in found
    csv = q(
        built_db, "SELECT status, motivo FROM fontes WHERE nome = 'PSI-39_Experimental table_CFI.csv'"
    ).row(0)
    assert csv == ("Não carregado", "Coberto por CFI_DataSummary_Spreadsheet_Jan2021.xlsx.")


def test_psi117_readme_says_which_tables_are_missing(built_db):
    tables = dict(q(built_db, "SELECT arquivo, presente_em_dados FROM psi117_tabelas").iter_rows())
    assert tables["PROCI_2019_Oscillatory_Cool_Flame"] is True
    assert tables["MST_2024_Dext"] is False
    found = set(q(built_db, "SELECT teste_id, tipo FROM alertas WHERE investigacao = 'PSI-117'").iter_rows())
    assert ("PROCI_2019_Oscillatory_Cool_Flame", "fracao_suspeita") in found  # XN2 = 85
    assert q(built_db, "SELECT count(*) FROM psi117_series_modelo").item() == 3


def test_psi117_measurements_are_traced_back_to_cfi_flights(built_db):
    links = q(built_db, "SELECT * FROM psi117_cfi_correspondencia")
    one_atm = links.filter(pl.col("tabela_psi117") == "extinção a 1 atm")
    assert set(one_atm["cfi_teste_id"]) == {"1206", "1251"}
    diverging = one_atm.filter(pl.col("situacao") == "mesmo ensaio, valor diferente").row(0, named=True)
    assert (
        diverging["cfi_teste_id"] == "1251"
        and diverging["valor_psi117_mm"] == 0
        and diverging["valor_cfi_mm"] == 2.972
    )
    by_pressure = links.filter(
        (pl.col("tabela_psi117") == "extinção por pressão") & pl.col("cfi_teste_id").is_not_null()
    )
    assert by_pressure.select("cfi_teste_id", "pressao_atm").rows() == [
        ("1240", 0.5)
    ]  # 3,48 × 3,485, dentro de 0,005
    alerts = q(built_db, "SELECT teste_id FROM alertas WHERE tipo = 'divergencia_entre_fontes'")["teste_id"]
    assert alerts.to_list() == ["CFI 1251"]


def test_psi142_flags_metadata_conflicts_and_swapped_columns(built_db):
    assert q(built_db, "SELECT count(*) FROM psi142_conjuntos").item() == 8
    found = q(built_db, "SELECT teste_id, tipo FROM alertas WHERE investigacao = 'PSI-142'")
    pairs = set(found.iter_rows())
    assert ("conjunto 1", "metadado_conflitante") in pairs and ("conjunto 2", "metadado_conflitante") in pairs
    assert ("conjuntos 6, 7, 8", "metadado_conflitante") in pairs  # mesmo artigo, DOIs diferentes
    swapped = found.filter(pl.col("tipo") == "eixo_suspeito")["teste_id"].to_list()
    assert swapped == ["conjunto 6 · nC10"]  # o nC10 do conjunto 7 está certo e não é marcado


def test_comparison_view_puts_both_studies_side_by_side(built_db):
    row = q(
        built_db,
        "SELECT * FROM v_extincao_c12_comparacao WHERE tipo_chama = 'Chama quente' AND pressao_atm = 1",
    )
    r = row.row(0, named=True)
    assert (
        r["psi117_medido_mm"] == 3.56 and r["cfi_ensaios"] == 2
    )  # 1206 e 1251; o 1274A tem hélio e fica fora
