"""Estudos: o cabeçalho com a ficha, a lista com busca, as fichas lado a lado e a página dos enviados.

Tudo aqui é leitura do banco. A busca e os filtros da lista rodam no navegador: a resposta leva o índice
de cada estudo (onde, texto), montado uma vez por versão do banco.
"""

from __future__ import annotations

import dataclasses
import re
from typing import Annotated

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..datasets.vocabulary import ATRIBUTOS
from ..evidence import fichas, search
from .frames import dataset

router = APIRouter(prefix="/api")

FICHA_COLUMNS = ["secao", "atributo", "rotulo", "valores", "unidade", "minimo", "maximo", "situacao", "origem",
                 "evidencia", "nota", "grandeza"]  # fmt: skip
DEFAULT_COMPARISON = ["PSI-69", "PSI-39", "PSI-117"]
MIN_COMPARED, MAX_COMPARED = 2, 4

_index: tuple[str, list[search.Entry]] | None = None


def rows(frame: pl.DataFrame) -> list[dict]:
    return dataset(frame)["rows"]


def db_stamp() -> str:
    """Muda sempre que o banco é refeito: serve de chave para o índice de busca."""
    return f"{db.DB_PATH}:{db.DB_PATH.stat().st_mtime_ns}" if db.exists() else "sem banco"


def psi_order(inv_id: str) -> int:
    """Ordem numérica do PSI: o BASS (26) fica ao lado do BASS-II (25)."""
    number = inv_id.split("-")[-1]
    return int(number) if number.isdigit() else 10**6


def header(inv_id: str) -> dict:
    """A investigação com o que o cabeçalho da página mostra: ficha, vínculos e metadados do portal."""
    found = db.query("SELECT * FROM investigacoes WHERE id = ?", [inv_id])
    if not found.height:
        raise HTTPException(404, f"Investigação {inv_id} não existe.")
    sheet, links = db.ficha(inv_id)
    meta, publications = db.metadata(inv_id)
    return {
        **found.row(0, named=True),
        "ficha": rows(sheet.select(FICHA_COLUMNS)) if sheet.height else [],
        "vinculos": rows(links.select("variavel_a", "variavel_b", "exemplos")) if links.height else [],
        "portal": meta,
        "publicacoes": [
            {"titulo": p["titulo"], "link": _publication_link(p)} for p in publications.iter_rows(named=True)
        ],
    }


def _publication_link(publication: dict) -> str | None:
    link = publication["link"] or (f"https://doi.org/{publication['doi']}" if publication["doi"] else None)
    return link if link and link.startswith("http") else None


def _sheet(tables: set[str]) -> pl.DataFrame:
    return db.query("SELECT * FROM ficha ORDER BY ordem") if "ficha" in tables else pl.DataFrame()


def _ranges(sheet: pl.DataFrame, attr: str) -> dict[str, tuple[float, float]]:
    """Faixa de um atributo numérico em cada estudo (todas as colunas dele juntas), na unidade comum."""
    out: dict[str, tuple[float, float]] = {}
    if not sheet.height:
        return out
    common = ATRIBUTOS[attr][2]  # faixas em outra unidade (não convertidas) não entram
    for r in sheet.filter((pl.col("atributo") == attr) & (pl.col("unidade") == common)).iter_rows(named=True):
        if r["minimo"] is not None and r["maximo"] is not None:
            lo, hi = r["minimo"], r["maximo"]
        elif r["minimo"] is not None or r["maximo"] is not None:
            continue  # faixa aberta ("≥ 21%", de um documento): não entra no filtro por faixa
        else:  # do ReadMe, em texto: "0.1, 0.21"
            numbers = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", r["valores"] or "")]
            if not numbers:
                continue
            lo, hi = min(numbers), max(numbers)
        old = out.get(r["investigacao"])
        out[r["investigacao"]] = (min(lo, old[0]), max(hi, old[1])) if old else (lo, hi)
    return out


def _search_index() -> dict[str, list[tuple[str, str]]]:
    global _index
    stamp = db_stamp()
    if _index is None or _index[0] != stamp:
        _index = (stamp, search.build_index())
    return {entry.id: entry.fields for entry in _index[1]}


@router.get("/studies")
def studies() -> dict:
    """Todos os estudos, com as etiquetas da ficha e o índice de busca de cada um."""
    tables = set(db.tables())
    sheet = _sheet(tables)
    alerts = dict(db.query("SELECT investigacao, count(*) AS n FROM alertas GROUP BY 1").iter_rows())
    oxygen, pressure = _ranges(sheet, "oxigenio"), _ranges(sheet, "pressao")
    fuels = fichas.categories(sheet, "combustivel") if sheet.height else {}
    shapes = fichas.categories(sheet, "forma_amostra") if sheet.height else {}
    index = _search_index()
    cards = []
    for inv in db.query("SELECT * FROM investigacoes").iter_rows(named=True):
        count = db.query(f'SELECT count(*) FROM "{inv["tabela"]}"').item() if inv["tabela"] in tables else 0
        cards.append(
            {
                **inv,
                "linhas": count,
                "alertas": alerts.get(inv["id"], 0),
                "amostra": "amostra" in (inv["fonte_carregada"] or "").lower(),
                "enviado": inv.get("origem") == "envio",
                "combustiveis": fuels.get(inv["id"], []),
                "formas": shapes.get(inv["id"], []),
                "oxigenio": oxygen.get(inv["id"]),
                "pressao": pressure.get(inv["id"]),
                "busca": index.get(inv["id"], []),
            }
        )
    cards.sort(key=lambda card: psi_order(card["id"]))
    return {"estudos": cards}


@router.get("/pages/estudos/{inv_id}")
def submitted_study(inv_id: str) -> dict:
    """A página genérica de um estudo enviado: as tabelas dele e o que cada coluna é."""
    inv = header(inv_id)
    tables = set(db.tables())
    if inv.get("origem") != "envio" or "estudo_colunas" not in tables:
        raise HTTPException(404, f"{inv_id} não é um estudo enviado.")
    dictionary = db.query(
        "SELECT * EXCLUDE (investigacao) FROM estudo_colunas WHERE investigacao = ?", [inv_id]
    )
    names = [n for n in dict.fromkeys(dictionary["tabela"].to_list()) if n in tables]
    suggested = (
        db.query("SELECT * EXCLUDE (investigacao) FROM estudo_sugestoes WHERE investigacao = ?", [inv_id])
        if "estudo_sugestoes" in tables
        else None
    )
    return {
        "investigacao": inv,
        "dicionario": rows(dictionary),
        "tabelas": {name: dataset(db.query(f'SELECT * FROM "{name}"')) for name in names},
        "sugestoes": dataset(suggested) if suggested is not None and suggested.height else None,
        "alertas": dataset(db.alerts(inv_id)),
    }


@router.get("/pages/fichas")
def sheets() -> dict:
    """Os estudos que dá para pôr lado a lado e a escolha inicial."""
    if "ficha" not in set(db.tables()):
        return {"disponivel": False, "estudos": [], "padrao": []}
    found = db.query("SELECT id, nome FROM investigacoes")
    names = {r["id"]: r["nome"].split(" — ")[0] for r in found.iter_rows(named=True)}
    return {
        "disponivel": True,
        "estudos": [{"id": i, "nome": names[i]} for i in sorted(names, key=psi_order)],
        "padrao": [i for i in DEFAULT_COMPARISON if i in names],
    }


@router.get("/fichas/comparar")
def compare_sheets(ids: Annotated[list[str], Query()]) -> dict:
    """O que de 2 a 4 estudos têm em comum: veredito por par, faixas de cada condição e a ficha comparada."""
    tables = set(db.tables())
    if "ficha" not in tables:
        raise HTTPException(404, "O banco não tem a ficha dos estudos. Rode a carga de novo.")
    chosen = list(dict.fromkeys(ids))
    investigations = db.query("SELECT * FROM investigacoes")
    unknown = [i for i in chosen if i not in set(investigations["id"])]
    if unknown:
        raise HTTPException(404, f"Estudo desconhecido: {', '.join(unknown)}.")
    if not MIN_COMPARED <= len(chosen) <= MAX_COMPARED:
        raise HTTPException(422, f"Escolha de {MIN_COMPARED} a {MAX_COMPARED} estudos.")
    sheet = db.query("SELECT * FROM ficha")
    links = db.query("SELECT * FROM ficha_vinculos") if "ficha_vinculos" in tables else pl.DataFrame()
    portal = db.query("SELECT * FROM metadados") if "metadados" in tables else None
    result = fichas.compare(sheet, links, investigations, chosen, portal)

    bands = []
    for attr in fichas.NUMERICOS:
        found = fichas.ranges(sheet, attr)
        present = [i for i in chosen if i in found]
        if len(present) < MIN_COMPARED:
            continue
        factor = fichas.ESCALA.get(attr, (1, None))[0]
        window = fichas.common_window([found[i] for i in present])
        bands.append(
            {
                "atributo": attr,
                "rotulo": fichas.label(attr),
                "unidade": fichas.unit(attr),
                "estudos": [
                    {
                        "id": i,
                        "minimo": found[i][0] * factor,
                        "maximo": found[i][1] * factor,
                        "texto": fichas.range_text(attr, found[i]),
                    }
                    for i in present
                ],  # fmt: skip
                # largura zero viraria uma linha parecida com o eixo
                "janela": [window[0] * factor, window[1] * factor]
                if window and window[1] > window[0]
                else None,
            }
        )
    return {
        "pares": [dataclasses.asdict(pair) for pair in result["pares"]],
        "janelas_comuns": result["janelas_comuns"],
        "faixas": bands,
        "tabela": dataset(result["tabela"]),
    }
