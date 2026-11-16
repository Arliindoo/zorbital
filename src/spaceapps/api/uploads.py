"""Envio de estudos e de documentos: receber → analisar (IA) → revisar → aprovar.

São as únicas rotas que escrevem: os arquivos recebidos ficam em `data/uploads/<envio>/` e só a aprovação
grava em `dados/` e refaz o banco. O estado do envio mora nessa pasta; o navegador guarda apenas o
identificador, então recarregar a página continua de onde parou.

    /api/envios       tabelas + documento de uma investigação nova (especificação de leitura)
    /api/documentos   documentos de um estudo que já está no sistema (só a ficha)
"""

from __future__ import annotations

import json
import re
import shutil
from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from .. import db
from ..datasets.vocabulary import ATRIBUTOS, GRANDEZAS
from ..ingest import build, generic
from ..integrations import provider
from ..studies import approve, documents, ficha_docs, propose, review, staging
from .frames import dataset

router = APIRouter(prefix="/api")

UPLOAD_ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{8}$")  # o formato que `staging.receive` gera; nada de caminho
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
SPEC_DRAFT = "especificacao_em_revisao.json"
SHEET_DRAFT = "ficha_em_revisao.json"


def _load(upload_id: str) -> staging.Upload:
    if not UPLOAD_ID.match(upload_id):
        raise HTTPException(404, "Envio não encontrado.")
    try:
        return staging.Upload.load(upload_id)
    except FileNotFoundError as error:
        raise HTTPException(404, "Envio não encontrado: ele pode ter sido descartado.") from error


def _read(files: list[UploadFile]) -> list[tuple[str, bytes]]:
    received, total = [], 0
    for file in files:
        content = file.file.read(MAX_UPLOAD_BYTES + 1)
        total += len(content)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "O envio passa de 200 MB.")
        received.append((file.filename or "", content))
    return received


def _receive(psi: str, files: list[UploadFile], *, require_table: bool) -> staging.Upload:
    try:
        return staging.receive(psi, _read(files), require_table=require_table)
    except staging.UploadError as error:
        raise HTTPException(422, str(error)) from error


def _base(upload: staging.Upload) -> dict:
    return {
        "id": upload.id,
        "psi": upload.psi,
        "criado_em": upload.criado_em,
        "estado": upload.estado,
        "arquivos": [{k: v for k, v in asdict(f).items() if k != "sha1"} for f in upload.arquivos],
        "avisos": upload.avisos,
    }


def _open(upload: staging.Upload) -> None:
    if upload.estado == "aprovado":
        raise HTTPException(409, f"{upload.psi} já foi aprovado: este envio não muda mais.")


def _analyse(run, upload: staging.Upload) -> None:
    try:
        run(upload)
    except provider.ProviderError as error:
        raise HTTPException(502, str(error)) from error


def _usage_cost(usage: dict | None) -> float | None:
    return (usage or {}).get("custo_zyt")


@router.get("/envios/vocabulario")
def vocabulary() -> dict:
    """As listas fechadas que a revisão oferece (as mesmas que a validação aceita)."""
    return {
        "naturezas": list(generic.NATUREZAS),
        "tipos": list(generic.TIPOS),
        "atributos": [{"chave": k, "rotulo": v[1], "unidade": v[2]} for k, v in ATRIBUTOS.items()],
        "atributos_condicao": list(ficha_docs.CONDITION_ATTRS),
        "grandezas": [{"chave": k, "rotulo": v[0], "unidade": v[1]} for k, v in GRANDEZAS.items()],
        "limite_caracteres": documents.MAX_CHARS_TOTAL,
        "limite_paginas_pdf": documents.MAX_PAGES_PER_PDF,
    }


# --- estudo novo: tabelas e documento -------------------------------------------------------------


def _spec(upload: staging.Upload, proposal: propose.Proposal) -> dict:
    draft = upload.folder / SPEC_DRAFT
    return json.loads(draft.read_text(encoding="utf-8")) if draft.exists() else proposal.especificacao


def _check_spec(upload: staging.Upload, spec: dict) -> dict:
    result = review.check_spec(upload, spec)
    if result["previa"] is not None:
        preview = result["previa"]
        for table in preview["tabelas"]:
            table["dados"] = dataset(table["dados"])
        if preview["alertas"] is not None:
            preview["alertas"] = dataset(preview["alertas"])
    return result


def _study_state(upload: staging.Upload) -> dict:
    state = {**_base(upload), "analise": None, "proposta": None, "especificacao": None, "conferencia": None}
    if upload.estado == "aprovado":
        return state
    proposal = propose.load_proposal(upload)
    if proposal is None:
        _, summary = propose.build_context(upload)
        return {**state, "analise": {"modelo": propose.model(), **summary}}
    spec = _spec(upload, proposal)
    return {
        **state,
        "proposta": {
            "modelo": proposal.modelo,
            "criada_em": proposal.criada_em,
            "tentativas": proposal.tentativas,
            "custo_zyt": _usage_cost(proposal.uso),
        },
        "especificacao": spec,
        "conferencia": _check_spec(upload, spec),
    }


@router.post("/envios")
def receive_study(psi: Annotated[str, Form()], arquivos: Annotated[list[UploadFile], File()]) -> dict:
    return _study_state(_receive(psi, arquivos, require_table=True))


@router.get("/envios/{upload_id}")
def study_upload(upload_id: str) -> dict:
    return _study_state(_load(upload_id))


@router.post("/envios/{upload_id}/analisar")
def analyse_study(upload_id: str) -> dict:
    upload = _load(upload_id)
    _open(upload)
    _analyse(propose.propose, upload)
    return _study_state(upload)


@router.put("/envios/{upload_id}/especificacao")
def save_spec(upload_id: str, spec: Annotated[dict[str, Any], Body()]) -> dict:
    """Guarda a especificação em revisão e devolve a conferência dela."""
    upload = _load(upload_id)
    _open(upload)
    if propose.load_proposal(upload) is None:
        raise HTTPException(409, "Este envio ainda não foi analisado.")
    if not isinstance(spec.get("investigacao"), dict) or not isinstance(spec.get("tabelas"), list):
        raise HTTPException(422, "Especificação sem investigação ou sem tabelas.")
    spec["investigacao"]["id"] = upload.psi  # o número do PSI é o que foi informado no envio
    (upload.folder / SPEC_DRAFT).write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    return _check_spec(upload, spec)


@router.post("/envios/{upload_id}/aprovar")
def approve_study(upload_id: str, substituir: Annotated[bool, Body(embed=True)] = False) -> dict:
    upload = _load(upload_id)
    _open(upload)
    proposal = propose.load_proposal(upload)
    if proposal is None:
        raise HTTPException(409, "Este envio ainda não foi analisado.")
    try:
        counts = approve.approve(upload, _spec(upload, proposal), model=proposal.modelo, replace=substituir)
    except staging.UploadError as error:
        raise HTTPException(422, str(error)) from error
    prefix = upload.psi.lower().replace("-", "")
    return {**_study_state(upload), "gravadas": {n: c for n, c in counts.items() if n.startswith(prefix)}}


@router.delete("/envios/{upload_id}")
@router.delete("/documentos/{upload_id}")
def discard(upload_id: str) -> dict:
    upload = _load(upload_id)
    if upload.estado != "aprovado":  # o aprovado fica: é o registro do que entrou em dados/
        shutil.rmtree(upload.folder, ignore_errors=True)
    return {"ok": True}


# --- documentos de um estudo que já está no sistema -----------------------------------------------


def _docs_state(upload: staging.Upload) -> dict:
    found = db.query("SELECT id, nome, origem FROM investigacoes WHERE id = ?", [upload.psi])
    study = found.row(0, named=True) if found.height else {"id": upload.psi, "nome": "", "origem": None}
    state = {
        **_base(upload),
        "estudo": study,
        "analise": None,
        "proposta": None,
        "ficha": None,
        "conferencia": None,
        "ja_existe": (build.DADOS / upload.psi / ficha_docs.FICHA_FILE).exists(),
    }
    if upload.estado == "aprovado":
        return state
    proposal = ficha_docs.load_proposal(upload)
    if proposal is None:
        _, summary = ficha_docs.build_context(upload)
        return {**state, "analise": {"modelo": ficha_docs.model(), **summary}}
    draft = upload.folder / SHEET_DRAFT
    sheet = json.loads(draft.read_text(encoding="utf-8")) if draft.exists() else proposal.ficha
    return {
        **state,
        "proposta": {
            "modelo": proposal.modelo,
            "criada_em": proposal.criada_em,
            "custo_zyt": _usage_cost(proposal.uso),
        },
        "ficha": sheet,
        "conferencia": review.check_sheet(sheet),
    }


@router.post("/documentos")
def receive_documents(psi: Annotated[str, Form()], arquivos: Annotated[list[UploadFile], File()]) -> dict:
    if not db.query("SELECT 1 FROM investigacoes WHERE id = ?", [psi]).height:
        raise HTTPException(404, f"{psi} não está no sistema: para um estudo novo, use Enviar estudo.")
    return _docs_state(_receive(psi, arquivos, require_table=False))


@router.get("/documentos/{upload_id}")
def documents_upload(upload_id: str) -> dict:
    return _docs_state(_load(upload_id))


@router.post("/documentos/{upload_id}/analisar")
def analyse_documents(upload_id: str) -> dict:
    upload = _load(upload_id)
    _open(upload)
    _analyse(ficha_docs.propose, upload)
    return _docs_state(upload)


@router.put("/documentos/{upload_id}/ficha")
def save_sheet(upload_id: str, sheet: Annotated[dict[str, Any], Body()]) -> dict:
    upload = _load(upload_id)
    _open(upload)
    if ficha_docs.load_proposal(upload) is None:
        raise HTTPException(409, "Estes documentos ainda não foram lidos.")
    (upload.folder / SHEET_DRAFT).write_text(
        json.dumps(sheet, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return review.check_sheet(sheet)


@router.post("/documentos/{upload_id}/aprovar")
def approve_documents(upload_id: str, substituir: Annotated[bool, Body(embed=True)] = False) -> dict:
    upload = _load(upload_id)
    _open(upload)
    proposal = ficha_docs.load_proposal(upload)
    if proposal is None:
        raise HTTPException(409, "Estes documentos ainda não foram lidos.")
    draft = upload.folder / SHEET_DRAFT
    sheet = json.loads(draft.read_text(encoding="utf-8")) if draft.exists() else proposal.ficha
    try:
        ficha_docs.approve(upload, sheet, model=proposal.modelo, replace=substituir)
    except staging.UploadError as error:
        raise HTTPException(422, str(error)) from error
    return _docs_state(upload)
