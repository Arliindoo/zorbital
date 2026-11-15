"""Dados de cada página do painel. O banco é só leitura; filtros e gráficos ficam no front-end."""

from __future__ import annotations

from typing import Annotated

import polars as pl
from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import data, db
from .frames import dataset
from .studies import header

router = APIRouter(prefix="/api")

# gotas primeiro (voo e solo), depois sólidos e contrafluxo
ORDER = ["PSI-69", "PSI-39", "PSI-117", "PSI-25", "PSI-142"]
UNITS = {
    "PSI-69": "Ensaios",
    "PSI-25": "Testes",
    "PSI-39": "Ensaios",
    "PSI-117": "Pontos",
    "PSI-142": "Pontos",
}
STATUS_ORDER = ["Carregado", "Não carregado", "Duplicata exata", "Documentação", "Não reconhecido"]
EXAMPLE = "Exemplo Gapminder"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def _alerts(inv_id: str | None = None) -> dict:
    return dataset(db.alerts(inv_id))


def _tables() -> set[str]:
    return set(db.tables())


@router.get("/overview")
def overview() -> dict:
    tables = _tables()
    investigations = db.query("SELECT * FROM investigacoes")
    alert_counts = db.query("SELECT * FROM v_alertas_resumo")
    rows = sorted(
        investigations.iter_rows(named=True), key=lambda r: ORDER.index(r["id"]) if r["id"] in ORDER else 99
    )
    cards = []
    for inv in rows:
        count = db.query(f'SELECT count(*) FROM "{inv["tabela"]}"').item() if inv["tabela"] in tables else 0
        cards.append(
            {
                **inv,
                "unidade": UNITS.get(inv["id"], "Linhas"),
                "linhas": count,
                "alertas": int(alert_counts.filter(pl.col("investigacao") == inv["id"])["ocorrencias"].sum()),
                "amostra": "amostra" in (inv["fonte_carregada"] or "").lower(),
            }
        )

    missing = []
    if investigations.filter(pl.col("fonte_carregada").str.contains("(?i)amostra")).height:
        missing.append("**PSI-69 FLEX:** só a amostra de 34 ensaios; falta `FLEX.csv` (cerca de 274).")
    if "psi117_tabelas" in tables:
        absent = db.query("SELECT arquivo FROM psi117_tabelas WHERE NOT presente_em_dados ORDER BY arquivo")
        if absent.height:
            missing.append(
                "**PSI-117:** o ReadMe da investigação lista tabelas que não estão em `dados/`: "
                + ", ".join(f"`{a}.csv`" for a in absent["arquivo"])
                + "."
            )

    sources = db.query("SELECT * FROM fontes ORDER BY status, caminho")
    status = (
        sources.group_by("status")
        .len()
        .sort(pl.col("status").replace_strict(STATUS_ORDER, list(range(len(STATUS_ORDER))), default=9))
    )
    return {
        "meta": db.meta(),
        "investigacoes": cards,
        "comparacao_disponivel": "v_extincao_c12_comparacao" in tables,
        "faltando": missing,
        "status_fontes": [{"status": s, "n": n} for s, n in status.iter_rows()],
        "fontes": dataset(
            sources.select(
                "caminho", "investigacao", "papel", "status", "motivo", "linhas_carregadas", "tamanho_bytes"
            )
        ),
        "alertas": _alerts(),
    }


@router.get("/investigations/{inv_id}")
def investigation(inv_id: str) -> dict:
    found = db.query("SELECT * FROM investigacoes WHERE id = ?", [inv_id])
    if not found.height:
        raise HTTPException(404, f"Investigação {inv_id} não existe.")
    return found.row(0, named=True)


@router.get("/pages/flex")
def flex() -> dict:
    return {
        "investigacao": header("PSI-69"),
        "ensaios": dataset(db.query("SELECT * FROM flex_ensaios ORDER BY teste_id::INT")),
        "alertas": _alerts("PSI-69"),
    }


@router.get("/pages/bass")
def bass() -> dict:
    return {
        "investigacao": header("PSI-25"),
        "testes": dataset(db.query("SELECT * FROM bass_ensaios ORDER BY pesquisador, teste_id")),
        "alertas": _alerts("PSI-25"),
    }


@router.get("/pages/cfi")
def cfi() -> dict:
    return {
        "investigacao": header("PSI-39"),
        "ensaios": dataset(db.query("SELECT * FROM cfi_ensaios ORDER BY teste_id")),
        "resumo": dataset(db.query("SELECT * FROM v_cfi_por_pressao")),
        "cameras": dataset(db.query("SELECT * EXCLUDE (fonte_arquivo) FROM cfi_cameras")),
        "alertas": _alerts("PSI-39"),
    }


@router.get("/pages/psi117")
def psi117() -> dict:
    tables = _tables()
    return {
        "investigacao": header("PSI-117"),
        "pontos": dataset(db.query("SELECT * FROM psi117_extincao ORDER BY tipo_chama, serie, pressao_atm")),
        "comparacao": dataset(db.query("SELECT * FROM v_psi117_comparacao")),
        "extincao_1atm": dataset(db.query("SELECT * FROM psi117_extincao_1atm"))
        if "psi117_extincao_1atm" in tables
        else None,
        "series_modelo": dataset(db.query("SELECT * FROM psi117_series_modelo"))
        if "psi117_series_modelo" in tables
        else None,
        "tabelas": dataset(db.query("SELECT * EXCLUDE (fonte_arquivo) FROM psi117_tabelas"))
        if "psi117_tabelas" in tables
        else None,
        "alertas": _alerts("PSI-117"),
    }


@router.get("/pages/psi142")
def psi142() -> dict:
    return {
        "investigacao": header("PSI-142"),
        "conjuntos": dataset(db.query("SELECT * FROM psi142_conjuntos ORDER BY conjunto_id")),
        "total_pontos": db.query("SELECT count(*) FROM psi142_pontos").item(),
        "alertas": _alerts("PSI-142"),
    }


@router.get("/pages/psi142/{conjunto_id}")
def psi142_set(conjunto_id: int) -> dict:
    """Os pontos de um conjunto: a tabela inteira tem milhares, a página mostra um conjunto por vez."""
    return dataset(db.query("SELECT * FROM psi142_pontos WHERE conjunto_id = ?", [conjunto_id]))


@router.get("/pages/comparacao")
def comparacao() -> dict:
    conditions = db.query(
        "SELECT * FROM psi117_tabelas WHERE arquivo = 'PROCI_2023_C12_Extinction_Diameter_vs_pressure'"
    )
    return {
        "psi117": dataset(db.query("SELECT * FROM v_psi117_comparacao")),
        "cfi": dataset(
            db.query(
                "SELECT * FROM cfi_ensaios WHERE combustivel = 'n-dodecano' ORDER BY pressao_atm, teste_id"
            )
        ),
        "correspondencia": dataset(db.query("SELECT * FROM psi117_cfi_correspondencia")),
        "condicoes": conditions.row(0, named=True) if conditions.height else None,
        "investigacoes": [db.investigation(i) for i in ("PSI-117", "PSI-39")],
    }


@router.get("/explore/sources")
def explore_sources() -> list[str]:
    return (db.tables() if db.exists() else []) + [EXAMPLE]


@router.get("/explore/sources/{name}")
def explore_source(name: str) -> dict:
    if name == EXAMPLE:
        return dataset(data.load_example())
    if name not in _tables():  # só nomes do catálogo: o nome entra no SQL
        raise HTTPException(404, f"Tabela '{name}' não existe.")
    return dataset(db.query(f'SELECT * FROM "{name}"'))


@router.post("/explore/upload")
def explore_upload(file: Annotated[UploadFile, File()]) -> dict:
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Arquivo maior que 50 MB.")
    try:
        frame = data.load_file(file.file, file.filename or "")
    except Exception as error:  # arquivo malformado: devolve o motivo em vez de um 500
        raise HTTPException(422, f"Não foi possível ler o arquivo: {error}") from error
    return dataset(frame)
