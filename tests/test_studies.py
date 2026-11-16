"""Envio de estudos: extração segura, recebimento, perfil, leitor genérico, proposta da IA e aprovação."""

import io
import json
import tarfile
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import duckdb
import polars as pl
import pytest
from fastapi.testclient import TestClient

from spaceapps import db
from spaceapps.api.app import create_app
from spaceapps.ingest import generic
from spaceapps.integrations import provider
from spaceapps.studies import approve, archive, profile, propose, staging

from .conftest import write_dados
from .test_assistant import sse

# --- um envio no formato do PSI-26 (BASS) -------------------------------------------------------

TABLE = (
    "BASS test log\n"
    ",,,,,\n"
    "Date,GMT,As Run Test #,Test #,Sample #,Fuel Sample Material\n"
    "3/30/2012,90,1,1,4,SIBAL 2 cm\n"
    "3/30/2012,90,2,42,24,PMMA sphere 2 cm\n"
    "8/3/2012,216,,,,SOOT Cleaning\n"
    "5/15/2103,135,3,12-R,19,Nomex III\n"
)
DOC = (
    "# BASS\nGMT is the day of the year (UTC). Test # is the planned test; As Run Test # is the order run.\n"
)


def zipped(**files: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        for name, text in files.items():
            z.writestr(name, text)
    return buffer.getvalue()


def spec_for(upload: staging.Upload, header_line: int = 3) -> dict:
    """A especificação que a IA proporia para o envio acima."""
    table = next(f.caminho for f in upload.arquivos if f.tipo == "tabela")
    doc_evidence = {
        "tipo": "documento",
        "arquivo": "pacote/leia.md",
        "pagina": 1,
        "trecho": "GMT is the day of the year",
    }
    return {
        "investigacao": {
            "id": upload.psi, "nome": "BASS — Burning and Suppression of Solids", "categoria": "Material sólido",
            "ambiente": "Microgravidade (ISS)", "tipo_evidencia": "Experimental",
            "pergunta": "Quais materiais foram testados e em que ordem?",
            "cautelas": [{"texto": "A tabela lista testes, não resultados.", "evidencia": {"tipo": "inferido"}}],
        },
        "tabelas": [{
            "nome": "testes", "descricao": "Um teste por linha", "layout": "simples",
            "fontes": [{"arquivo": table, "aba": None, "linha_cabecalho": header_line}],
            "colunas": [
                {"origem": "Date", "destino": "data", "descricao": "Data", "unidade": None, "natureza": "CONDICAO",
                 "tipo": "data", "evidencia": {"tipo": "cabecalho"}},
                {"origem": "GMT", "destino": "gmt_dia", "descricao": "Dia do ano", "unidade": "dia",
                 "natureza": "CONDICAO", "tipo": "numero", "evidencia": doc_evidence},
                {"origem": "As Run Test #", "destino": "ordem", "descricao": "Ordem", "unidade": "adimensional",
                 "natureza": "IDENTIFICADOR", "tipo": "numero", "evidencia": {"tipo": "documento", "arquivo": "pacote/leia.md", "pagina": 1}},
                {"origem": "Test #", "destino": "teste_id", "descricao": "Teste", "natureza": "IDENTIFICADOR",
                 "tipo": "texto", "evidencia": {"tipo": "cabecalho"}},
                {"origem": "Sample #", "destino": "amostra", "descricao": "Amostra", "natureza": "IGNORAR",
                 "tipo": "texto", "evidencia": {"tipo": "cabecalho"}},
                {"origem": "Fuel Sample Material", "destino": "material", "descricao": "Material", "natureza": "CONDICAO",
                 "tipo": "categoria", "evidencia": {"tipo": "inferido"}},
            ],
            "excluir_linhas": [{"coluna": "material", "valores": ["SOOT Cleaning"], "motivo": "Manutenção, não é teste."}],
        }],
        "comparacoes_sugeridas": [{"com_investigacao": "PSI-25", "grandeza": "material testado",
                                   "ressalvas": "Só o catálogo de materiais; sem medições."}],
        "lacunas": ["Unidade das amostras não informada."],
    }  # fmt: skip


@pytest.fixture
def received(tmp_path):
    files = [("pacote.zip", zipped(**{"tabela.csv": TABLE, "leia.md": DOC, "__MACOSX/._tabela.csv": "lixo"}))]
    return staging.receive("psi 26", files, uploads_dir=tmp_path / "uploads")


# --- extração segura ----------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["../fora.txt", "/etc/passwd", "a/../../fora.txt"])
def test_archive_refuses_paths_that_escape(tmp_path, name):
    bad = tmp_path / "ruim.zip"
    bad.write_bytes(zipped(**{name: "x", "ok.csv": "a,b\n1,2\n"}))
    with pytest.raises(archive.ArchiveError, match="Caminho"):
        archive.extract(bad, tmp_path / "out")
    assert not (tmp_path / "fora.txt").exists()


def test_archive_refuses_links_in_tar(tmp_path):
    bad = tmp_path / "ruim.tar.gz"
    with tarfile.open(bad, "w:gz") as t:
        link = tarfile.TarInfo("link")
        link.type, link.linkname = tarfile.SYMTYPE, "/etc/passwd"
        t.addfile(link)
    with pytest.raises(archive.ArchiveError, match="não é arquivo comum"):
        archive.extract(bad, tmp_path / "out")


def test_archive_enforces_size_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(archive, "MAX_TOTAL_BYTES", 100)
    big = tmp_path / "grande.zip"
    big.write_bytes(zipped(**{"a.csv": "x" * 500}))
    with pytest.raises(archive.ArchiveError, match="grande demais"):
        archive.extract(big, tmp_path / "out")


def test_rar_path_via_7z_extracts_and_lists(tmp_path):
    """O caminho do .rar usa o 7z, que também lê .zip: dá para testar a listagem e a extração sem um .rar."""
    if not archive.shutil.which("7z"):
        pytest.skip("7z não instalado")
    source = tmp_path / "x.zip"
    source.write_bytes(zipped(**{"d/t.csv": "a\n1\n", "leia.md": "doc"}))
    members = archive._extract_rar(source, tmp_path / "out")
    assert sorted(m.name for m in members) == ["d/t.csv", "leia.md"]
    assert (tmp_path / "out" / "d" / "t.csv").read_text() == "a\n1\n"


# --- recebimento --------------------------------------------------------------------------------


def test_receive_unpacks_classifies_and_skips_junk(received):
    assert received.psi == "PSI-26"
    kinds = {f.caminho: f.tipo for f in received.arquivos}
    assert kinds == {"pacote/tabela.csv": "tabela", "pacote/leia.md": "documento"}
    assert (received.files_dir / "pacote" / "tabela.csv").read_text() == TABLE
    assert staging.Upload.load(received.id, received.folder.parent).psi == "PSI-26"


def test_receive_requires_a_document(tmp_path):
    with pytest.raises(staging.UploadError, match="documento"):
        staging.receive("PSI-26", [("t.csv", b"a,b\n1,2\n")], uploads_dir=tmp_path)
    assert not any(tmp_path.iterdir())  # envio recusado não deixa pasta


def test_receive_accepts_nested_archive_and_warns_on_xls(tmp_path):
    inner = zipped(**{"t.csv": "a,b\n1,2\n", "velho.xls": "x"})
    upload = staging.receive(
        "PSI-7", [("fora.tar.gz", _tgz({"dentro.zip": inner, "rel.txt": b"doc"}))], uploads_dir=tmp_path
    )
    assert {f.tipo for f in upload.arquivos} == {"tabela", "documento", "tabela_nao_suportada"}
    assert any("velho.xls" in w for w in upload.avisos)


def _tgz(files: dict) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as t:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            t.addfile(info, io.BytesIO(content))
    return buffer.getvalue()


def test_invalid_psi_is_refused():
    with pytest.raises(staging.UploadError, match="PSI"):
        staging.normalize_psi("estudo novo")


# --- perfil e leitor genérico -------------------------------------------------------------------


def test_profile_finds_header_below_title_rows(received):
    sheet = profile.profile_files(received.files_dir, ["pacote/tabela.csv"])[0]
    assert sheet.linha_cabecalho == 3
    assert "Fuel Sample Material" in profile.as_prompt([sheet])


def test_validation_blocks_unconfirmed_inference_and_unmapped_columns(received):
    spec = spec_for(received)
    problems = generic.validate(spec, received.files_dir)
    assert any("material" in p.lower() and "não confirmada" in p for p in problems)
    spec["tabelas"][0]["colunas"].pop()  # tira a coluna do material
    assert any("sem destino" in p for p in generic.validate(spec, received.files_dir))


def test_generic_reader_keeps_provenance_and_records_alerts(received):
    spec = spec_for(received)
    tables, alerts, dictionary = generic.apply(spec, received.files_dir)
    rows = tables["psi26_testes"]
    assert rows.height == 3  # a linha de manutenção foi excluída
    assert rows["linha_fonte"].to_list() == [4, 5, 7]
    assert (
        set(rows.columns) >= {"fonte_arquivo", "fonte_aba", "linha_fonte"} and "amostra" not in rows.columns
    )
    kinds = set(alerts.select("teste_id", "tipo").iter_rows())
    assert ("? · ?", "linha_excluida") in kinds  # a linha de manutenção não tem identificadores
    assert ("3 · 12-R", "data_suspeita") in kinds  # 2103
    assert dictionary.filter(pl.col("coluna") == "gmt_dia")["evidencia_pagina"].item() == 1


# --- proposta da IA (Zyria falsa) ---------------------------------------------------------------


def tool_call(arguments: dict) -> bytes:
    call = {
        "index": 0,
        "id": "c1",
        "type": "function",
        "function": {"name": "propor_estudo", "arguments": json.dumps(arguments)},
    }
    return sse(
        {"id": "a", "object": "chat.completion.chunk", "created": 0, "model": "m",
         "choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": [call]}, "finish_reason": "tool_calls"}]},
        {"zyria": {"custo_zyt": 0.05}},
        "[DONE]",
    )  # fmt: skip


@pytest.fixture
def fake_zyria_proposals():
    state = {"replies": [], "requests": []}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            state["requests"].append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(state["replies"].pop(0))

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    state["config"] = provider.Config(f"http://127.0.0.1:{server.server_port}/api/public/v1", "zy_test", "m")
    yield state
    server.shutdown()


def test_proposal_is_validated_and_corrected_by_the_ai(received, fake_zyria_proposals, use_db):
    wrong, right = spec_for(received, header_line=1), spec_for(received)
    fake_zyria_proposals["replies"] = [tool_call(wrong), tool_call(right)]
    api = provider.client(fake_zyria_proposals["config"])

    result = propose.propose(received, api=api, config=fake_zyria_proposals["config"])

    assert result.tentativas == 2
    first, second = fake_zyria_proposals["requests"]
    assert "Fuel Sample Material" in first["messages"][1]["content"]  # perfil das tabelas
    assert "GMT is the day of the year" in first["messages"][1]["content"]  # texto do documento, com página
    assert "linha 1" in second["messages"][-1]["content"]  # os problemas voltaram para a IA
    assert result.uso["custo_zyt"] == pytest.approx(0.10)
    assert all("não confirmada" in p for p in result.problemas)  # só o que a pessoa precisa confirmar
    material = next(c for c in result.especificacao["tabelas"][0]["colunas"] if c["destino"] == "material")
    assert material["confirmado"] is False  # inferência nasce não confirmada
    assert propose.load_proposal(received).tentativas == 2


# --- aprovação ----------------------------------------------------------------------------------


@pytest.fixture
def approved(received, tmp_path):
    dados = write_dados(tmp_path / "projeto")
    path = tmp_path / "projeto" / "data" / "z.duckdb"
    spec = spec_for(received)
    for column in spec["tabelas"][0]["colunas"]:
        column["confirmado"] = True  # a pessoa revisou
    approve.approve(received, spec, model="m", dados_dir=dados, db_path=path, seed_dir=tmp_path / "seed")
    return dados, path, tmp_path / "seed"


def test_approval_writes_spec_and_loads_the_study(approved):
    dados, path, seed_dir = approved
    spec = json.loads((dados / "PSI-26" / "estudo.json").read_text())
    assert spec["_aprovacao"]["modelo_que_propos"] == "m"
    with duckdb.connect(str(path), read_only=True) as con:
        q = lambda s: pl.from_arrow(con.sql(s).to_arrow_table())  # noqa: E731
        assert q("SELECT count(*) FROM psi26_testes").item() == 3
        inv = q("SELECT origem, tabela FROM investigacoes WHERE id = 'PSI-26'").row(0)
        assert inv == ("envio", "psi26_testes")
        assert (
            q("SELECT count(*) FROM estudo_colunas WHERE investigacao = 'PSI-26'").item() == 5
        )  # sem a IGNORAR
        assert q("SELECT com_investigacao FROM estudo_sugestoes").item() == "PSI-25"
        status = dict(q("SELECT caminho, status FROM fontes WHERE investigacao = 'PSI-26'").iter_rows())
        assert (
            status["PSI-26/pacote/tabela.csv"] == "Carregado" and status["PSI-26/estudo.json"] == "Carregado"
        )
    assert (seed_dir / "psi26_testes.parquet").exists()


def test_approval_refuses_catalog_studies_and_existing_folders(approved, received):
    dados, path, _ = approved
    spec = spec_for(received)
    for column in spec["tabelas"][0]["colunas"]:
        column["confirmado"] = True
    with pytest.raises(staging.UploadError, match="já existe"):
        approve.approve(received, spec, dados_dir=dados, db_path=path)
    spec["investigacao"]["id"] = "PSI-25"
    with pytest.raises(staging.UploadError, match="leitor próprio"):
        approve.approve(received, spec, dados_dir=dados, db_path=path)


@pytest.fixture
def approved_api(approved, monkeypatch):
    """A API sobre o banco que já tem o PSI-26 aprovado."""
    monkeypatch.setattr(db, "DB_PATH", approved[1])
    with TestClient(create_app()) as api:
        yield api


def test_submitted_study_has_its_own_page(approved_api):
    page = approved_api.get("/api/pages/estudos/PSI-26").json()

    assert page["investigacao"]["nome"] == "BASS — Burning and Suppression of Solids"
    assert list(page["tabelas"]) == ["psi26_testes"] and len(page["tabelas"]["psi26_testes"]["rows"]) == 3
    assert {c["coluna"] for c in page["dicionario"]} <= {
        c["name"] for c in page["tabelas"]["psi26_testes"]["columns"]
    }
    assert page["sugestoes"]["rows"][0]["com_investigacao"] == "PSI-25"
    # estudos do catálogo têm página própria, e um PSI que não existe não tem nenhuma
    assert approved_api.get("/api/pages/estudos/PSI-25").status_code == 404
    assert approved_api.get("/api/pages/estudos/PSI-999").status_code == 404


def test_studies_hub_lists_every_study_with_its_search_index(approved_api):
    from spaceapps.evidence import search

    cards = approved_api.get("/api/studies").json()["estudos"]

    assert len(cards) == 6  # 5 do catálogo + o PSI-26 enviado
    assert [c["id"] for c in cards][:2] == ["PSI-25", "PSI-26"]  # ordem numérica: os dois BASS lado a lado
    assert [c["id"] for c in cards if c["enviado"]] == ["PSI-26"]
    # a busca roda no navegador sobre o índice que vem em cada cartão (onde, texto)
    index = [search.Entry(c["id"], [tuple(f) for f in c["busca"]]) for c in cards]
    assert set(search.search(index, "sibal")) == {"PSI-25", "PSI-26"}  # nos dois BASS sintéticos
    assert not search.search(index, "nada-que-exista")


def test_search_ignores_accents_and_needs_every_word(approved, monkeypatch):
    from spaceapps.evidence import search

    _, path, _ = approved
    monkeypatch.setattr(db, "DB_PATH", path)
    index = search.build_index()
    assert "PSI-39" in search.search(index, "EXTINCAO")  # sem acento acha "extinção"
    assert set(search.search(index, "chama fria n-dodecano")) <= {"PSI-39", "PSI-117"}
    hits = search.search(index, "SIBAL")
    assert "PSI-25" in hits and any("material" in h for h in hits["PSI-25"])  # diz onde achou
    assert search.search(index, "").keys() == {e.id for e in index}  # busca vazia mostra todos
