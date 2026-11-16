"""Etapa 4: ficha a partir dos documentos — trechos conferidos no texto, revisão obrigatória, carga sem IA."""

import json

import duckdb
import polars as pl
import pytest

from spaceapps.evidence import fichas
from spaceapps.ingest import build, generic
from spaceapps.integrations import provider
from spaceapps.studies import ficha_docs, propose, staging
from tests.conftest import write_dados
from tests.test_studies import fake_zyria_proposals, received, spec_for, sse, tool_call  # noqa: F401

SRD = (
    "Science Requirements for FLEX\n"
    "The droplets burn in quiescent air, with no imposed flow velocity in the chamber.\n"
    "A UV camera with a 310 nm filter records OH* chemiluminescence to track the flame standoff.\n"
    "The test matrix covers ambient pressure of 2 atm only for the methanol series.\n"
)


def q(path, sql):
    with duckdb.connect(str(path), read_only=True) as con:
        return pl.from_arrow(con.sql(sql).to_arrow_table())


def evidence(quote: str, page: int = 1) -> dict:
    return {"arquivo": "srd.txt", "pagina": page, "trecho": quote}


def sheet() -> dict:
    return {
        "objetivo": {"texto": "Mapear limites de extinção.", "evidencia": evidence("Science Requirements for FLEX")},
        "sensores": [{"nome": "Câmera UV", "mede": "Quimiluminescência de OH*", "grandeza": "emissao_chama",
                      "evidencia": evidence("records OH* chemiluminescence to track the flame standoff")}],
        "condicoes": [
            {"atributo": "velocidade_fluxo", "valor": "ar parado", "minimo": 0, "maximo": 0, "unidade": "cm/s",
             "evidencia": evidence("burn in quiescent air, with no imposed flow velocity")},
            {"atributo": "pressao", "valor": "2 atm", "minimo": 2, "maximo": 2, "unidade": "atm",
             "evidencia": evidence("covers ambient pressure of 2 atm only")},
            {"atributo": "temperatura", "valor": "300 K", "minimo": 300, "maximo": 300, "unidade": "K",
             "evidencia": evidence("chamber held at 300 K by the heaters")},  # não está no documento
        ],
    }  # fmt: skip


@pytest.fixture
def docs_upload(tmp_path):
    return staging.receive("PSI-69", [("srd.txt", SRD.encode())], uploads_dir=tmp_path / "uploads",
                           require_table=False)  # fmt: skip


# --- conferência dos trechos --------------------------------------------------------------------


def test_quotes_are_checked_against_the_page_text(docs_upload):
    checked = ficha_docs.check(sheet(), docs_upload.files_dir)
    by_attr = {c["atributo"]: c for c in checked["condicoes"]}

    assert checked["sensores"][0]["conferido"] and checked["sensores"][0]["confirmado"]
    assert by_attr["velocidade_fluxo"]["conferido"]  # quebra de linha, pontuação e maiúsculas não atrapalham
    assert not by_attr["temperatura"]["conferido"] and not by_attr["temperatura"]["confirmado"]
    assert ficha_docs.pending(checked) == 1
    assert not ficha_docs.validate(checked)  # desmarcado não é problema: só não entra
    assert [c["atributo"] for c in ficha_docs.accepted(checked)["condicoes"]] == [
        "velocidade_fluxo",
        "pressao",
    ]


def test_wrong_page_short_quote_and_escaping_paths_do_not_check(docs_upload):
    item = {"nome": "x", "mede": "y"}
    cases = {
        "página longe": evidence("records OH* chemiluminescence", page=4),
        "curto": evidence("UV"),
        "fora da pasta": {"arquivo": "../../../etc/hostname", "pagina": 1, "trecho": "localhost localdomain"},
    }
    for name, ev in cases.items():
        result = ficha_docs.check({"sensores": [{**item, "evidencia": ev}]}, docs_upload.files_dir)
        assert not result["sensores"][0]["conferido"], name
    near = ficha_docs.check({"sensores": [{**item, "evidencia": evidence("records OH* chemiluminescence", 2)}]},
                            docs_upload.files_dir)  # fmt: skip
    assert near["sensores"][0]["conferido"]  # uma página de folga


def test_a_decision_made_in_review_survives_a_new_check(docs_upload):
    checked = ficha_docs.check(sheet(), docs_upload.files_dir)
    next(c for c in checked["condicoes"] if c["atributo"] == "temperatura")["confirmado"] = True
    again = ficha_docs.check(checked, docs_upload.files_dir)
    assert not ficha_docs.validate(again)


def test_docs_only_upload_needs_a_document(tmp_path):
    with pytest.raises(staging.UploadError, match="documento"):
        staging.receive("PSI-69", [("t.csv", b"a\n1\n")], uploads_dir=tmp_path, require_table=False)


# --- proposta, aprovação e carga ----------------------------------------------------------------


def ficha_call(payload: dict) -> bytes:
    call = {
        "index": 0,
        "id": "f1",
        "type": "function",
        "function": {"name": "propor_ficha", "arguments": json.dumps({"ficha": payload})},
    }
    return sse(
        {"id": "a", "object": "chat.completion.chunk", "created": 0, "model": "m",
         "choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": [call]}, "finish_reason": "tool_calls"}]},
        {"zyria": {"custo_zyt": 0.03}}, "[DONE]",
    )  # fmt: skip


def test_catalog_sheet_is_proposed_checked_approved_and_loaded(docs_upload, fake_zyria_proposals, tmp_path):  # noqa: F811
    dados = write_dados(tmp_path / "projeto")
    path = tmp_path / "projeto" / "data" / "z.duckdb"
    build.build(dados, path)
    fake_zyria_proposals["replies"] = [ficha_call(sheet())]
    config = fake_zyria_proposals["config"]

    import spaceapps.db as dbmod

    old = dbmod.DB_PATH
    dbmod.DB_PATH = path
    try:
        proposal = ficha_docs.propose(docs_upload, api=provider.client(config), config=config)
    finally:
        dbmod.DB_PATH = old
    request = fake_zyria_proposals["requests"][0]
    assert "quiescent air" in request["messages"][1]["content"]  # texto do documento
    assert "Pressão" in request["messages"][1]["content"]  # o que os dados já dizem, para não repetir
    assert ficha_docs.load_proposal(docs_upload).investigacao == "PSI-69"
    assert not proposal.problemas and ficha_docs.pending(proposal.ficha) == 1  # a temperatura, sem trecho

    broken = json.loads(json.dumps(proposal.ficha))
    broken["condicoes"][0]["minimo"] = 5  # marcado, mas com mínimo maior que o máximo
    with pytest.raises(staging.UploadError, match="problemas"):
        ficha_docs.approve(docs_upload, broken, dados_dir=dados, db_path=path, seed_dir=tmp_path / "s")
    ficha_docs.approve(
        docs_upload, proposal.ficha, model="m", dados_dir=dados, db_path=path, seed_dir=tmp_path / "s"
    )

    assert (dados / "PSI-69" / "documentos" / "srd.txt").exists()
    saved = json.loads((dados / "PSI-69" / "ficha.json").read_text())
    assert saved["investigacao"] == "PSI-69" and saved["_aprovacao"]["modelo_que_propos"] == "m"
    rows = q(path, "SELECT * FROM ficha WHERE investigacao = 'PSI-69' AND origem = 'documento'")
    by_attr = {r["atributo"]: r for r in rows.iter_rows(named=True)}
    assert set(by_attr) == {"objetivo", "sensor", "velocidade_fluxo", "pressao"}  # sem a temperatura
    assert by_attr["sensor"]["grandeza"] == "emissao_chama"
    assert by_attr["velocidade_fluxo"]["evidencia"].startswith("srd.txt p. 1: “burn in quiescent air")
    # os dados mostram outra faixa de pressão: a ficha mostra os dois e registra o alerta, sem corrigir nada
    assert (
        by_attr["pressao"]["situacao"] == "divergente"
        and "dados carregados mostram" in by_attr["pressao"]["nota"]
    )
    alert = q(path, "SELECT * FROM alertas WHERE tipo = 'ficha_divergente'")
    assert alert["investigacao"].to_list() == ["PSI-69"]
    status = q(path, "SELECT status, papel FROM fontes WHERE caminho = 'PSI-69/ficha.json'").row(0)
    assert status == ("Carregado", "Ficha dos documentos (aprovada)")
    # nas comparações, a faixa de pressão continua sendo a dos dados
    sheet_all = q(path, "SELECT * FROM ficha")
    assert fichas.ranges(sheet_all, "pressao")["PSI-69"][1] < 1.5  # não o 2 atm do documento
    assert fichas.ranges(sheet_all, "velocidade_fluxo")["PSI-69"] == (0, 0)  # só o documento diz: entra


def test_invalid_ficha_file_is_not_loaded(tmp_path):
    dados = write_dados(tmp_path / "projeto")
    (dados / "PSI-69").mkdir()
    (dados / "PSI-69" / "ficha.json").write_text(json.dumps({"investigacao": "PSI-69", **sheet()}))
    path = tmp_path / "z.duckdb"
    build.build(dados, path)
    status, motivo = q(path, "SELECT status, motivo FROM fontes WHERE caminho = 'PSI-69/ficha.json'").row(0)
    assert status == "Não carregado" and "não confirmada" in motivo  # nunca passou pela conferência
    assert not q(path, "SELECT count(*) FROM ficha WHERE origem = 'documento'").item()


# --- no envio, na mesma chamada da especificação ------------------------------------------------


def test_submission_proposal_carries_the_checked_sheet(received, fake_zyria_proposals, use_db):  # noqa: F811
    spec = spec_for(received)
    spec["ficha"] = {"sensores": [
        {"nome": "Relógio", "mede": "dia do ano", "evidencia": {"arquivo": "pacote/leia.md", "pagina": 1,
                                                               "trecho": "GMT is the day of the year (UTC)"}},
        {"nome": "Termopar", "mede": "temperatura", "evidencia": {"arquivo": "pacote/leia.md", "pagina": 1,
                                                                 "trecho": "a thermocouple measured the gas"}},
    ]}  # fmt: skip
    fake_zyria_proposals["replies"] = [tool_call(spec)]
    config = fake_zyria_proposals["config"]

    result = propose.propose(received, api=provider.client(config), config=config)

    assert "ficha" in fake_zyria_proposals["requests"][0]["tools"][0]["function"]["parameters"]["properties"]
    clock, thermo = result.especificacao["ficha"]["sensores"]
    assert clock["conferido"] and not thermo["conferido"]
    assert not [p for p in generic.validate(result.especificacao, received.files_dir) if "Ficha" in p]
    assert [s["nome"] for s in ficha_docs.accepted(result.especificacao["ficha"])["sensores"]] == ["Relógio"]


# --- revisão na tela ------------------------------------------------------------------------------


def test_documents_review_counts_what_enters_and_what_stays_out(docs_upload, client, monkeypatch):
    monkeypatch.setattr(staging, "UPLOADS_DIR", docs_upload.folder.parent)
    checked = ficha_docs.check(sheet(), docs_upload.files_dir)
    proposal = ficha_docs.Proposal(ficha=checked, problemas=ficha_docs.validate(checked), modelo="m",
                                   uso={"custo_zyt": 0.03}, investigacao="PSI-69")  # fmt: skip
    (docs_upload.folder / ficha_docs.PROPOSAL_FILE).write_text(json.dumps(proposal.__dict__))

    state = client.get(f"/api/documentos/{docs_upload.id}").json()

    assert state["estudo"]["id"] == "PSI-69" and state["proposta"]["custo_zyt"] == 0.03
    assert state["conferencia"] == {"problemas": [], "itens": 4, "desmarcados": 1}
    edited = state["ficha"]
    edited["objetivo"]["confirmado"] = False  # o objetivo sai
    saved = client.put(f"/api/documentos/{docs_upload.id}/ficha", json=edited).json()
    assert saved == {"problemas": [], "itens": 3, "desmarcados": 2}
    # a revisão fica guardada no envio: recarregar a página continua de onde parou
    assert client.get(f"/api/documentos/{docs_upload.id}").json()["ficha"]["objetivo"]["confirmado"] is False


def test_open_ranges_and_gas_percent_units_from_documents():
    from spaceapps.ingest import ficha

    rows = ficha.document_rows("PSI-26", {"condicoes": [
        {"atributo": "oxigenio", "valor": "igual ou acima de 21%", "minimo": 21, "maximo": None, "unidade": "% O2",
         "evidencia": evidence("at or above 21% O2"), "conferido": True, "confirmado": True},
    ]})  # fmt: skip
    assert (rows[0]["minimo"], rows[0]["maximo"], rows[0]["unidade"]) == (0.21, None, "fração molar")

    data = {"investigacao": "PSI-26", "origem": "dados", "atributo": "oxigenio", "unidade": "fração molar",
            "minimo": 0.15, "maximo": 0.22, "valores": "0.15 – 0.22"}  # fmt: skip
    sheet = pl.DataFrame([{**rows[0], "ordem": 0}, {**rows[0], **data, "ordem": 1}], infer_schema_length=None)
    marked, alerts = ficha.mark_divergences(sheet)
    assert alerts.height == 1 and "O documento diz ≥ 0.21 fração molar" in alerts["detalhe"][0]
    assert fichas.ranges(marked, "oxigenio") == {"PSI-26": (0.15, 0.22)}  # a faixa aberta não entra


def test_extinguishing_agent_and_planned_items():
    from spaceapps.ingest import ficha

    assert "agente_extintor" in ficha_docs.CONDITION_ATTRS and "agente_extintor" in fichas.CATEGORICOS
    assert "agente_extintor" in json.dumps(propose.TOOL)  # a IA do envio também vê o atributo
    item = {
        "atributo": "agente_extintor",
        "valor": "N2 por bocal de 3,2 mm, 0 a 500 cc/min",
        "planejado": True,
        "evidencia": evidence("Nitrogen is supplied through the nozzle"),
        "conferido": True,
        "confirmado": True,
    }
    assert not ficha_docs.validate({"condicoes": [item]})
    row = ficha.document_rows("PSI-26", {"condicoes": [item]})[0]
    assert row["secao"] == "condicao" and "planejado" in row["nota"]
