"""API do painel: cada página responde com os dados que o front-end espera, e o assistente em NDJSON."""

import io
import json

import polars as pl
import pytest
from fastapi.testclient import TestClient

from spaceapps.api import app as app_module
from spaceapps.api.app import create_app
from spaceapps.api.frames import dataset, frame_from_rows

PAGES = {
    "flex": {"investigacao", "ensaios", "alertas"},
    "bass": {"investigacao", "testes", "alertas"},
    "cfi": {"investigacao", "ensaios", "resumo", "cameras", "alertas"},
    "psi117": {
        "investigacao",
        "pontos",
        "comparacao",
        "extincao_1atm",
        "series_modelo",
        "tabelas",
        "alertas",
    },
    "psi142": {"investigacao", "conjuntos", "total_pontos", "alertas"},
    "comparacao": {"psi117", "cfi", "correspondencia", "condicoes", "investigacoes"},
}


def events(response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def test_dataset_keeps_column_kinds_and_writes_valid_json():
    frame = pl.DataFrame({"a": [1.5, float("nan")], "b": ["x", None], "c": [True, False]})
    out = dataset(frame)

    assert [c["kind"] for c in out["columns"]] == ["number", "string", "boolean"]
    assert out["rows"][1] == {"a": None, "b": None, "c": False}  # NaN vira null: o JSON continua válido
    json.dumps(out, allow_nan=False)


def test_rows_sent_by_the_browser_become_a_frame_again():
    frame = frame_from_rows([{"teste_id": "1", "x": 2.0}, {"teste_id": "2", "x": None}], ["teste_id", "x"])
    assert frame.columns == ["teste_id", "x"] and frame.height == 2
    assert frame_from_rows([], ["teste_id"]).columns == ["teste_id"]


def test_overview_lists_investigations_sources_and_alerts(client):
    body = client.get("/api/overview").json()

    flex = next(c for c in body["investigacoes"] if c["id"] == "PSI-69")
    assert flex["amostra"] and flex["linhas"] == 4 and flex["unidade"] == "Ensaios"
    assert body["fontes"]["rows"] and body["alertas"]["rows"]
    assert any("PSI-69" in m for m in body["faltando"])


@pytest.mark.parametrize("page", PAGES)
def test_each_page_returns_its_data(client, page):
    response = client.get(f"/api/pages/{page}")

    assert response.status_code == 200
    assert set(response.json()) == PAGES[page]


def test_psi142_points_come_one_set_at_a_time(client):
    sets = client.get("/api/pages/psi142").json()["conjuntos"]["rows"]
    first = sets[0]["conjunto_id"]
    points = client.get(f"/api/pages/psi142/{first}").json()["rows"]

    assert points and {p["conjunto_id"] for p in points} == {first}


def test_unknown_investigation_is_404(client):
    assert client.get("/api/investigations/PSI-999").status_code == 404
    assert client.get("/api/investigations/PSI-69").json()["id"] == "PSI-69"


def test_explore_only_opens_tables_from_the_catalog(client):
    sources = client.get("/api/explore/sources").json()

    assert "flex_ensaios" in sources and "Exemplo Gapminder" in sources
    assert client.get("/api/explore/sources/flex_ensaios").json()["rows"]
    assert client.get('/api/explore/sources/x"; DROP TABLE alertas; --').status_code == 404


def test_explore_reads_an_uploaded_csv_and_explains_a_bad_one(client):
    ok = client.post(
        "/api/explore/upload", files={"file": ("a.csv", io.BytesIO(b"pais,ano,valor\nBR,2000,1\n"))}
    )
    bad = client.post("/api/explore/upload", files={"file": ("a.txt", io.BytesIO(b"oi"))})

    assert ok.status_code == 200 and ok.json()["rows"] == [{"pais": "BR", "ano": 2000, "valor": 1}]
    assert bad.status_code == 422 and "Formato não suportado" in bad.json()["detail"]


def test_assistant_pages_list_the_tool_groups(client):
    groups = client.get("/api/assistant/pages").json()
    assert set(groups) == {"overview", "flex", "bass", "psi117", "cfi", "psi142", "comparacao", "estudos",
                           "fichas", "explore"}  # fmt: skip


def test_chat_without_zyria_config_explains_what_is_missing(client):
    response = client.post(
        "/api/assistant/chat",
        json={
            "screen": {"pagina": "psi117", "titulo": "PSI-117", "dados": [{"a": 1}]},
            "question": "O que é chama fria?",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    [event] = events(response)
    assert event["type"] == "error" and "ZYRIA_BASE_URL" in event["message"]


def test_chat_refuses_an_unknown_page_and_empty_question(client):
    unknown = {"screen": {"pagina": "admin", "titulo": "x"}, "question": "oi"}
    empty = {"screen": {"pagina": "flex", "titulo": "x"}, "question": ""}

    assert client.post("/api/assistant/chat", json=unknown).status_code == 422
    assert client.post("/api/assistant/chat", json=empty).status_code == 422


def test_production_build_is_served_with_spa_fallback(use_db, tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<div id=root></div>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    monkeypatch.setattr(app_module, "DIST", dist)

    with TestClient(create_app()) as client:
        assert client.get("/assets/app.js").text == "console.log(1)"
        assert client.get("/favicon.svg").text == "<svg/>"
        assert client.get("/psi117").text == "<div id=root></div>"  # rota do React Router
        assert client.get("/../pyproject.toml").text == "<div id=root></div>"
        assert client.get("/api/nada").status_code == 404  # API desconhecida não cai no index.html
