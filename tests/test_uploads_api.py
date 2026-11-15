"""Envio pela API: receber, analisar (com uma IA de mentira), revisar e aprovar, tudo em pasta temporária."""

import json

import duckdb
import pytest

from spaceapps.studies import approve, ficha_docs, propose, staging
from tests.conftest import write_dados
from tests.test_studies import DOC, TABLE, spec_for, zipped


@pytest.fixture
def uploads(tmp_path, monkeypatch):
    """Os envios destes testes ficam fora de data/uploads."""
    folder = tmp_path / "uploads"
    monkeypatch.setattr(staging, "UPLOADS_DIR", folder)
    return folder


def send_package(client, psi: str = "PSI-26"):
    package = zipped(**{"tabela.csv": TABLE, "leia.md": DOC})
    return client.post("/api/envios", data={"psi": psi}, files=[("arquivos", ("pacote.zip", package))])


def fake_proposal(upload: staging.Upload) -> propose.Proposal:
    """O que `propose.propose` deixa no envio, sem chamar a IA."""
    spec = spec_for(upload)
    for column in spec["tabelas"][0]["colunas"]:
        column["confirmado"] = column["evidencia"]["tipo"] != "inferido"
    proposal = propose.Proposal(
        especificacao=spec, problemas=[], modelo="m", uso={"custo_zyt": 0.1}, tentativas=1
    )
    (upload.folder / "proposta.json").write_text(json.dumps(proposal.__dict__, default=str))
    upload.estado = "proposto"
    upload.save()
    return proposal


def test_study_upload_goes_from_files_to_an_approved_study(client, uploads, tmp_path, monkeypatch):
    received = send_package(client).json()

    assert received["estado"] == "recebido" and received["psi"] == "PSI-26"
    assert {f["tipo"] for f in received["arquivos"]} == {"tabela", "documento"}
    assert "sha1" not in received["arquivos"][0]
    # antes de chamar a IA, a tela mostra o que vai para ela e quanto custa
    assert received["analise"]["abas"] == 1 and received["analise"]["documentos"] == 1
    assert received["analise"]["custo_zyt_aprox"] > 0 and received["especificacao"] is None
    base = f"/api/envios/{received['id']}"

    monkeypatch.setattr(propose, "propose", fake_proposal)
    proposed = client.post(f"{base}/analisar").json()

    assert proposed["estado"] == "proposto" and proposed["analise"] is None
    assert proposed["proposta"] == {"modelo": "m", "criada_em": proposed["proposta"]["criada_em"], "tentativas": 1,
                                    "custo_zyt": 0.1}  # fmt: skip
    check = proposed["conferencia"]
    assert len(check["problemas"]) == 1 and "não confirmada" in check["problemas"][0]
    assert [(t["nome"], t["linhas"]) for t in check["previa"]["tabelas"]] == [("psi26_testes", 3)]
    assert check["previa"]["alertas"]["rows"]

    spec = proposed["especificacao"]
    for column in spec["tabelas"][0]["colunas"]:
        column["confirmado"] = True  # a pessoa revisou
    spec["investigacao"]["id"] = "PSI-25"  # o número do PSI é o do envio: a revisão não troca
    assert client.put(f"{base}/especificacao", json=spec).json()["problemas"] == []
    reopened = client.get(base).json()  # recarregar a página continua de onde parou
    assert reopened["especificacao"]["investigacao"]["id"] == "PSI-26"
    assert all(c["confirmado"] for c in reopened["especificacao"]["tabelas"][0]["colunas"])

    dados, path = write_dados(tmp_path / "projeto"), tmp_path / "projeto" / "data" / "z.duckdb"
    real = approve.approve
    monkeypatch.setattr(
        approve,
        "approve",
        lambda upload, spec, **options: real(
            upload, spec, dados_dir=dados, db_path=path, seed_dir=tmp_path / "seed", **options
        ),
    )
    approved = client.post(f"{base}/aprovar", json={"substituir": False}).json()

    assert approved["estado"] == "aprovado" and approved["gravadas"] == {"psi26_testes": 3}
    assert (
        json.loads((dados / "PSI-26" / "estudo.json").read_text())["_aprovacao"]["modelo_que_propos"] == "m"
    )
    with duckdb.connect(str(path), read_only=True) as con:
        assert con.sql("SELECT origem FROM investigacoes WHERE id = 'PSI-26'").fetchall() == [("envio",)]
    # aprovado, o envio não muda mais e não é apagado: é o registro do que entrou em dados/
    assert client.put(f"{base}/especificacao", json=spec).status_code == 409
    assert client.delete(base).json() == {"ok": True} and (uploads / received["id"]).exists()


def test_review_needs_an_analysis_first_and_keeps_the_last_valid_state(client, uploads, monkeypatch):
    base = f"/api/envios/{send_package(client).json()['id']}"

    assert client.put(f"{base}/especificacao", json={"investigacao": {}, "tabelas": []}).status_code == 409
    assert client.post(f"{base}/aprovar", json={"substituir": False}).status_code == 409
    monkeypatch.setattr(propose, "propose", fake_proposal)
    spec = client.post(f"{base}/analisar").json()["especificacao"]

    assert client.put(f"{base}/especificacao", json={"tabelas": "x"}).status_code == 422
    spec["tabelas"][0]["fontes"][0]["arquivo"] = "nao_existe.csv"
    broken = client.put(f"{base}/especificacao", json=spec).json()
    assert broken["previa"] is None and "corrija primeiro" in broken["previa_erro"]
    # com problemas, a aprovação é recusada com o motivo, e o envio continua em revisão
    refused = client.post(f"{base}/aprovar", json={"substituir": False})
    assert refused.status_code == 422 and "ainda tem problemas" in refused.json()["detail"]
    assert client.get(base).json()["estado"] == "proposto"


def test_refused_uploads_say_why_and_ids_cannot_leave_the_uploads_folder(client, uploads):
    assert "PSI inválido" in send_package(client, psi="estudo x").json()["detail"]
    only_table = client.post("/api/envios", data={"psi": "PSI-26"}, files=[("arquivos", ("t.csv", TABLE))])
    assert only_table.status_code == 422 and "nenhum documento" in only_table.json()["detail"]

    # o identificador só vale no formato que o recebimento gera: nada que pareça caminho chega ao disco
    (uploads.parent / "envio.json").write_text("{}")
    for upload_id in ("20260101-000000-abcdef12", "...", "..%2F", "%2E%2E"):
        assert client.get(f"/api/envios/{upload_id}").status_code == 404

    received = send_package(client).json()
    assert client.delete(f"/api/envios/{received['id']}").json() == {"ok": True}
    assert not (uploads / received["id"]).exists()
    assert client.get(f"/api/envios/{received['id']}").status_code == 404


def test_documents_upload_is_for_a_study_already_in_the_system(client, uploads):
    document = [("arquivos", ("srd.txt", "The droplets burn in quiescent air."))]

    unknown = client.post("/api/documentos", data={"psi": "PSI-999"}, files=document)
    assert unknown.status_code == 404 and "Enviar estudo" in unknown.json()["detail"]

    state = client.post("/api/documentos", data={"psi": "PSI-69"}, files=document).json()
    assert state["estudo"]["id"] == "PSI-69" and state["estudo"]["nome"].startswith("FLEX")
    assert state["analise"]["documentos"] == 1 and state["ficha"] is None and not state["ja_existe"]
    # só documentos: a tabela não é exigida aqui, e sem leitura da IA não há o que revisar
    assert client.put(f"/api/documentos/{state['id']}/ficha", json={}).status_code == 409


def test_vocabulary_matches_what_validation_accepts(client):
    vocabulary = client.get("/api/envios/vocabulario").json()

    assert "IGNORAR" in vocabulary["naturezas"] and "numero" in vocabulary["tipos"]
    keys = {a["chave"] for a in vocabulary["atributos"]}
    assert set(vocabulary["atributos_condicao"]) == keys - {"medicao"} == set(ficha_docs.CONDITION_ATTRS)
    assert {"chave": "diametro_extincao", "rotulo": "Diâmetro de extinção", "unidade": "mm"} in vocabulary[
        "grandezas"
    ]
