"""Ficha dos estudos: atributos calculados dos dados, o que variou e o que ficou fixo, e vínculos."""

import duckdb
import polars as pl
import pytest

from spaceapps.ingest import ficha
from spaceapps.ingest.ficha import Papel


def q(path, sql):
    with duckdb.connect(str(path), read_only=True) as con:
        return pl.from_arrow(con.sql(sql).to_arrow_table())


def test_describe_converts_to_the_common_unit_and_says_if_it_varied():
    frame = pl.DataFrame({"p": [760.0, 760.0, 2280.0], "fuel": ["a", "a", "a"]})

    pressure = ficha.describe(frame, "p", Papel("pressao", "Pressão", 1 / 760))
    fuel = ficha.describe(frame, "fuel", Papel("combustivel", "Combustível"))

    assert pressure["unidade"] == "atm"
    assert (pressure["minimo"], pressure["maximo"]) == pytest.approx((1.0, 3.0))
    assert pressure["situacao"] == "variou" and pressure["valores"] == "1 – 3"
    assert fuel["situacao"] == "fixo" and fuel["valores"] == "a (3)"
    assert ficha.describe(frame, "nao_existe", Papel("pressao", "Pressão")) is None


def test_measurements_keep_their_own_unit_and_nature():
    frame = pl.DataFrame(
        {"d": [1.0, 2.0], "vazio": [None, None]}, schema={"d": pl.Float64, "vazio": pl.Float64}
    )

    measured = ficha.describe(frame, "d", Papel("medicao", "Diâmetro", unidade="mm", natureza="MEDIDO"))
    empty = ficha.describe(frame, "vazio", Papel("oxigenio", "Oxigênio"))

    assert (measured["unidade"], measured["situacao"]) == ("mm", "medido")
    assert empty["situacao"] == "sem dados"


def test_levels_group_close_readings_but_keep_design_levels_exact():
    readings = pl.Series([757.0, 760, 761, 763, 765, 768, 770, 773, 2319])  # 9 leituras: agrupa
    design = pl.Series([0.15, 0.18, 0.21, 0.15])  # 3 níveis do desenho: ficam como estão

    grouped = ficha._levels(readings, Papel("pressao", "Pressão", 1 / 760))
    exact = ficha._levels(design, Papel("oxigenio", "Oxigênio"))

    assert grouped.n_unique() == 2 and grouped[-1] == "3.05"
    assert set(exact) == {"0.15", "0.18", "0.21"}


def test_links_find_conditions_that_did_not_vary_independently():
    # pressão alta só com 21% de O2; a 1 atm, O2 variou
    frame = pl.DataFrame(
        {"p": [1.0, 1.0, 1.0, 1.0, 3.0, 3.0], "o2": [0.15, 0.15, 0.18, 0.18, 0.21, 0.21],
         "n2": [0.85, 0.85, 0.82, 0.82, 0.79, 0.79], "d": [1.0, 2, 3, 4, 5, 6]}
    )  # fmt: skip
    roles = {"p": Papel("pressao", "Pressão"), "o2": Papel("oxigenio", "Oxigênio"),
             "n2": Papel("nitrogenio", "Nitrogênio"), "d": Papel("medicao", "D", natureza="MEDIDO")}  # fmt: skip

    links = ficha.vinculos(frame, roles)

    assert [(r["variavel_a"], r["variavel_b"]) for r in links] == [("Pressão", "Oxigênio")]  # N2 e medida não
    assert "com pressão 3, só oxigênio 0.21 (2 testes)" in links[0]["exemplos"]


def test_independent_conditions_and_sample_attributes_are_not_links():
    frame = pl.DataFrame(
        {"p": [1.0, 1.0, 3.0, 3.0], "o2": [0.15, 0.21, 0.15, 0.21], "fuel": ["a", "a", "b", "b"],
         "size": [2.0, 2.0, 4.0, 4.0]}
    )  # fmt: skip
    roles = {"p": Papel("pressao", "Pressão"), "o2": Papel("oxigenio", "Oxigênio"),
             "fuel": Papel("combustivel", "Combustível"), "size": Papel("tamanho_amostra", "Tamanho")}  # fmt: skip

    pairs = {frozenset((r["variavel_a"], r["variavel_b"])) for r in ficha.vinculos(frame, roles)}

    assert frozenset(("Pressão", "Oxigênio")) not in pairs  # cruzamento completo
    assert frozenset(("Combustível", "Tamanho")) not in pairs  # a mesma amostra
    assert frozenset(("Combustível", "Pressão")) in pairs  # combustível b só a 3 atm


def test_guess_reads_the_attribute_from_the_column_name():
    assert ficha._guess("pressao_atm") == "pressao"
    assert ficha._guess("o2_inicial_pct") == "oxigenio"
    assert ficha._guess("amostra_id") is None


def test_build_writes_the_sheet_with_its_evidence(built_db):
    sheet = q(built_db, "SELECT * FROM ficha WHERE investigacao = 'PSI-69'")
    pressure = sheet.filter(pl.col("atributo") == "pressao").row(0, named=True)
    shape = sheet.filter(pl.col("atributo") == "forma_amostra").row(0, named=True)

    assert pressure["unidade"] == "atm" and pressure["evidencia"] == "flex_ensaios.pressao_mmhg ÷ 760"
    assert pressure["maximo"] < 10  # convertido de mmHg
    assert (shape["origem"], shape["valores"]) == ("descrição da investigação", "gota esférica")
    assert set(q(built_db, "SELECT DISTINCT investigacao FROM ficha")["investigacao"]) >= {
        "PSI-69", "PSI-25", "PSI-39", "PSI-117", "PSI-142",
    }  # fmt: skip


def test_submitted_study_uses_the_attribute_from_its_spec():
    tables = {"psi7_t": pl.DataFrame({"pressure_kpa": [101.0, 50.0], "x": ["a", "b"], "y": [1.0, 2.0]})}
    submitted = pl.DataFrame(
        {"investigacao": ["PSI-7"] * 3, "tabela": ["psi7_t"] * 3, "coluna": ["pressure_kpa", "x", "y"],
         "natureza": ["CONDICAO", "CONDICAO", "MEDIDO"], "atributo": ["pressao", None, None],
         "unidade": ["kPa", None, "mm"], "descricao": ["Pressão da câmara", "Algo", "Resultado"]}
    )  # fmt: skip
    inv = [{"id": "PSI-7", "origem": "envio", "tabela": "psi7_t"}]

    sheet, _ = ficha.compute(tables, inv, submitted)
    by_column = {r["coluna"]: r for r in sheet.iter_rows(named=True)}

    assert by_column["pressure_kpa"]["atributo"] == "pressao"
    assert by_column["x"]["atributo"] == "outra_condicao"
    assert (by_column["y"]["atributo"], by_column["y"]["unidade"]) == ("medicao", "mm")


def test_submitted_units_are_converted_or_kept_when_unknown():
    tables = {"psi7_t": pl.DataFrame({"p": [101.325, 50.0], "o2": [21.0, 15.0], "v": [1.0, 2.0]})}
    submitted = pl.DataFrame(
        {"investigacao": ["PSI-7"] * 3, "tabela": ["psi7_t"] * 3, "coluna": ["p", "o2", "v"],
         "natureza": ["CONDICAO"] * 3, "atributo": ["pressao", "oxigenio", "velocidade_fluxo"],
         "unidade": ["kPa", "%", "pés/min"], "descricao": ["", "", ""]}
    )  # fmt: skip
    sheet, _ = ficha.compute(tables, [{"id": "PSI-7", "origem": "envio", "tabela": "psi7_t"}], submitted)
    by_column = {r["coluna"]: r for r in sheet.iter_rows(named=True)}

    assert by_column["p"]["maximo"] == pytest.approx(1.0) and by_column["p"]["unidade"] == "atm"
    assert by_column["o2"]["maximo"] == pytest.approx(0.21) and by_column["o2"]["unidade"] == "fração molar"
    assert by_column["v"]["unidade"] == "pés/min" and "não convertida" in by_column["v"]["nota"]


def test_study_page_carries_the_sheet_and_the_hub_the_ranges(client):
    sheet = client.get("/api/pages/flex").json()["investigacao"]["ficha"]
    assert {"variou", "fixo"} <= {item["situacao"] for item in sheet}
    assert all(item["evidencia"] for item in sheet if item["origem"] == "dados")  # cada item diz de onde saiu

    cards = {c["id"]: c for c in client.get("/api/studies").json()["estudos"]}
    pressures = {i: c["pressao"] for i, c in cards.items() if c["pressao"]}
    assert len(pressures) > 1 and all(lo <= hi for lo, hi in pressures.values())
    top = max(hi for _, hi in pressures.values())  # só parte dos estudos chega à pressão máxima
    assert 0 < sum(hi >= top for _, hi in pressures.values()) < len(pressures)
    assert cards["PSI-69"]["combustiveis"] and cards["PSI-69"]["oxigenio"]


# --- etapa 5: fichas lado a lado ------------------------------------------------------------------


def _sheet(rows):
    base = {"tabela": "t", "origem": "dados", "evidencia": "t.c", "coluna": "c", "natureza": "CONDICAO",
            "registros": 2, "niveis": 2, "minimo": None, "maximo": None, "valores": None, "lista": None,
            "nota": None, "grandeza": None, "situacao": "variou", "secao": "condicao"}  # fmt: skip
    return pl.DataFrame([base | r for r in rows], infer_schema_length=None)


SHEET = _sheet([
    {"investigacao": "A", "atributo": "oxigenio", "rotulo": "O2", "unidade": "fração molar", "minimo": 0.15, "maximo": 0.21},
    {"investigacao": "B", "atributo": "oxigenio", "rotulo": "O2", "unidade": "fração molar", "minimo": 0.18, "maximo": 0.30},
    {"investigacao": "C", "atributo": "oxigenio", "rotulo": "O2", "unidade": "fração molar", "minimo": 0.25, "maximo": 0.40},
    {"investigacao": "A", "atributo": "pressao", "rotulo": "Pressão", "unidade": "atm", "minimo": 1.0, "maximo": 3.0},
    {"investigacao": "B", "atributo": "pressao", "rotulo": "Pressão", "unidade": "atm", "minimo": 0.997, "maximo": 0.997},
    {"investigacao": "C", "atributo": "pressao", "rotulo": "Pressão", "unidade": "kPa", "minimo": 50.0, "maximo": 101.0},
    {"investigacao": "A", "atributo": "combustivel", "rotulo": "Combustível", "lista": "n-Dodecano | metanol"},
    {"investigacao": "B", "atributo": "combustivel", "rotulo": "Combustível", "valores": "n-dodecano (3)"},
    {"investigacao": "C", "atributo": "combustivel", "rotulo": "Combustível", "lista": "PMMA"},
    {"investigacao": "A", "atributo": "medicao", "rotulo": "D ext", "unidade": "mm", "grandeza": "diametro_extincao"},
    {"investigacao": "B", "atributo": "medicao", "rotulo": "Dext q", "unidade": "mm", "grandeza": "diametro_extincao"},
    {"investigacao": "C", "atributo": "medicao", "rotulo": "Sinal", "grandeza": "emissao_chama | outra_medicao"},
])  # fmt: skip
INVS = pl.DataFrame({"id": ["A", "B", "C"], "ambiente": ["ISS", "ISS", "solo"],
                     "tipo_evidencia": ["Experimental"] * 3})  # fmt: skip


def test_pair_verdicts_use_overlap_quantity_and_fuel():
    from spaceapps import fichas

    result = fichas.compare(SHEET, pl.DataFrame(), INVS, ["A", "B", "C"])
    pairs = {(p.a, p.b): p for p in result["pares"]}

    ab = pairs[("A", "B")]
    assert ab.veredito == "Janela comparável"
    assert "Oxigênio: 18–21 %" in ab.sobrepoe and any(
        t.startswith("Pressão") for t in ab.sobrepoe
    )  # 2% de tolerância
    assert ab.combustiveis_comuns == ["n-Dodecano"]  # sem diferenciar maiúsculas
    assert ab.grandezas_comuns == ["Diâmetro de extinção"]

    ac = pairs[("A", "C")]
    assert ac.veredito == "Nada medido em comum"  # "outra_medicao" não conta como grandeza em comum
    assert any(t.startswith("Oxigênio") for t in ac.nao_sobrepoe)
    assert "Pressão (só A registra)" in ac.so_um  # a pressão de C está em kPa, não convertida: fica de fora
    assert any("Ambientes diferentes" in w for w in ac.avisos)
    assert result["janelas_comuns"]["Oxigênio"] == "sem faixa comum a todos"


def test_side_by_side_table_has_one_column_per_study():
    from spaceapps import fichas

    table = fichas.side_by_side(SHEET, ["A", "B"])
    rows = {r["atributo"]: r for r in table.iter_rows(named=True)}
    assert table.columns == ["atributo", "A", "B"]
    assert rows["Oxigênio"]["A"] == "15–21 %" and rows["Pressão"]["B"] == "0.997 atm"
    assert rows["Mede: Diâmetro de extinção"] == {
        "atributo": "Mede: Diâmetro de extinção",
        "A": "D ext",
        "B": "Dext q",
    }


def test_compare_tool_is_locked_to_the_studies_on_screen(use_db):
    import json

    from spaceapps.assistant import tools
    from spaceapps.assistant.screen import Screen

    screen = Screen(pagina="fichas", titulo="Fichas", escopo=["PSI-69", "PSI-39"])
    run = lambda **a: json.loads(tools.execute("comparar_fichas", json.dumps(a), screen))  # noqa: E731

    found = run()
    assert [p["par"] for p in found["pares"]] == ["PSI-69 × PSI-39"]
    assert "Fora da seleção: PSI-25" in run(investigacoes=["PSI-69", "PSI-25"])["erro"]
    flex = Screen(pagina="flex", titulo="FLEX", investigacao="PSI-69")
    assert "não está disponível" in json.loads(tools.execute("comparar_fichas", "{}", flex))["erro"]


def test_side_by_side_endpoint_gives_verdicts_ranges_and_table(client):
    listing = client.get("/api/pages/fichas").json()
    assert listing["disponivel"] and set(listing["padrao"]) <= {s["id"] for s in listing["estudos"]}

    found = client.get("/api/fichas/comparar", params={"ids": ["PSI-69", "PSI-39", "PSI-117"]}).json()
    assert [(p["a"], p["b"]) for p in found["pares"]] == [("PSI-69", "PSI-39"), ("PSI-69", "PSI-117"),
                                                          ("PSI-39", "PSI-117")]  # fmt: skip
    assert all(p["veredito"] for p in found["pares"])
    assert [c["name"] for c in found["tabela"]["columns"]] == ["atributo", "PSI-69", "PSI-39", "PSI-117"]
    for band in found["faixas"]:  # cada faixa já vem na unidade de tela, com pelo menos dois estudos
        assert len(band["estudos"]) >= 2 and all(s["minimo"] <= s["maximo"] for s in band["estudos"])
    assert client.get("/api/fichas/comparar", params={"ids": ["PSI-69"]}).status_code == 422
    assert client.get("/api/fichas/comparar", params={"ids": ["PSI-69", "PSI-999"]}).status_code == 404


# --- metadados do portal --------------------------------------------------------------------------


def test_portal_metadata_is_read_without_people(built_db):
    meta = q(built_db, "SELECT * FROM metadados ORDER BY investigacao")
    pubs = q(built_db, "SELECT * FROM publicacoes WHERE investigacao = 'PSI-69' ORDER BY ordem")

    assert meta["investigacao"].to_list() == ["PSI-39", "PSI-69"]
    flex = meta.filter(pl.col("investigacao") == "PSI-69").row(0, named=True)
    assert flex["objetivo"] == "Map the limits:\n1) first item.\n2) second item."  # multilinha preservada
    assert flex["palavras_chave"] == "Droplet | Extinction"
    assert not any("pessoa" in c or "email" in c for c in meta.columns)
    assert "pessoa@exemplo.org" not in str(meta.to_dicts())
    assert pubs[["titulo", "doi", "link"]].rows() == [
        ("Paper one", "10.1/one", None), ("Paper two", None, "https://ntrs.nasa.gov/citations/2")
    ]  # fmt: skip
    assert q(built_db, "SELECT status FROM fontes WHERE nome = 'DadosPsi.tar.gz'").item() == "Carregado"


def test_same_hardware_becomes_a_warning_and_a_row(use_db):
    from spaceapps import db, fichas

    result = fichas.compare(db.query("SELECT * FROM ficha"), pl.DataFrame(), db.query("SELECT * FROM investigacoes"),
                            ["PSI-69", "PSI-39"], db.query("SELECT * FROM metadados"))  # fmt: skip
    assert any("Mesmo equipamento (MDCA" in w for w in result["pares"][0].avisos)
    assert result["tabela"]["atributo"][0] == "Equipamento (portal)"


def test_metadata_feeds_search_and_the_study_page(client):
    from spaceapps import search

    assert "PSI-69" in search.search(search.build_index(), "extinction droplet")
    inv = client.get("/api/pages/flex").json()["investigacao"]
    assert inv["portal"]["objetivo"].startswith("Map the limits")
    assert inv["publicacoes"] == [{"titulo": "Paper one", "link": "https://doi.org/10.1/one"},
                                  {"titulo": "Paper two", "link": "https://ntrs.nasa.gov/citations/2"}]  # fmt: skip
