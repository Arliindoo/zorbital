"""Busca de estudos: por metadados, colunas e valores das categorias de cada estudo.

Ignora acentos e maiúsculas; com várias palavras, o estudo precisa ter todas (em qualquer campo).
Devolve também onde cada palavra foi encontrada, para a tela explicar por que o estudo apareceu.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field

import polars as pl

from . import db
from .assistant import dictionary

MAX_DISTINCT = 60  # colunas de texto com mais valores que isso não são categorias (ex.: comentários)
MAX_VALUE_LEN = 60
METADATA = {"id": "PSI", "nome": "nome", "categoria": "categoria", "ambiente": "ambiente",
            "tipo_evidencia": "tipo de evidência", "pergunta": "pergunta", "cautelas": "cautelas"}  # fmt: skip


def fold(text: object) -> str:
    """Minúsculo e sem acento: 'Extinção' → 'extincao'."""
    decomposed = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


@dataclass
class Entry:
    id: str
    fields: list[tuple[str, str]] = field(default_factory=list)  # (onde, texto original)

    def add(self, where: str, text: object) -> None:
        if text is not None and str(text).strip():
            self.fields.append((where, str(text)))


def _study_tables(inv: dict, all_tables: set[str], submitted: pl.DataFrame) -> list[str]:
    """Tabelas de um estudo: as do estudo enviado, ou as do catálogo com o mesmo prefixo da principal."""
    if inv.get("origem") == "envio":
        return sorted(set(submitted.filter(pl.col("investigacao") == inv["id"])["tabela"]))
    prefix = inv["tabela"].split("_")[0] + "_"
    return sorted(t for t in all_tables if t.startswith(prefix) and not t.startswith("v_"))


def build_index() -> list[Entry]:
    tables = set(db.tables())
    investigations = db.query("SELECT * FROM investigacoes ORDER BY id")
    submitted = db.query("SELECT * FROM estudo_colunas") if "estudo_colunas" in tables else pl.DataFrame(
        schema={"investigacao": pl.String, "tabela": pl.String}
    )  # fmt: skip
    meta = (
        {r["investigacao"]: r for r in db.query("SELECT * FROM metadados").iter_rows(named=True)}
        if "metadados" in tables
        else {}
    )
    index = []
    for inv in investigations.iter_rows(named=True):
        entry = Entry(inv["id"])
        portal = meta.get(inv["id"], {})
        for key, where in (
            ("sigla", "sigla"),
            ("equipamento", "equipamento"),
            ("palavras_chave", "palavras-chave"),
        ):
            entry.add(where, portal.get(key))
        for key, where in METADATA.items():
            if key != "cautelas":  # texto longo: fica por último, para não virar o "motivo" de tudo
                entry.add(where, inv.get(key))
        for table in _study_tables(inv, tables, submitted):
            columns = db.query(f'SELECT * FROM "{table}" LIMIT 0').columns
            known = dictionary.COLUMNS.get(table, {})
            described = submitted.filter(pl.col("tabela") == table) if "coluna" in submitted.columns else None
            for column in columns:
                if column in ("fonte_arquivo", "fonte_aba", "linha_fonte"):
                    continue
                entry.add(f"coluna {column}", column)
                if column in known:
                    entry.add(f"coluna {column}", known[column][0])
            if described is not None:
                for row in described.iter_rows(named=True):
                    entry.add(f"coluna {row['coluna']}", row.get("descricao"))
                    entry.add(f"coluna {row['coluna']}", row.get("origem"))
            _add_category_values(entry, table)
        for key, where in (("objetivo", "objetivo"), ("hipotese", "hipótese")):  # texto longo, por último
            entry.add(where, portal.get(key))
        entry.add("cautelas", inv.get("cautelas"))
        index.append(entry)
    return index


def _add_category_values(entry: Entry, table: str) -> None:
    frame = db.query(f'SELECT * FROM "{table}"')
    for name, dtype in frame.schema.items():
        if dtype != pl.String or name in ("fonte_arquivo", "fonte_aba"):
            continue
        values = frame[name].drop_nulls().unique()
        if 0 < values.len() <= MAX_DISTINCT:
            for value in values.to_list():
                if len(value) <= MAX_VALUE_LEN:
                    entry.add(f"{name} = {value}", value)


def search(index: list[Entry], query: str) -> dict[str, list[str]]:
    """Estudos que têm todas as palavras da busca → onde cada palavra apareceu (sem repetir)."""
    words = [w for w in fold(query).split() if w]
    if not words:
        return {entry.id: [] for entry in index}
    found = {}
    for entry in index:
        hits = []
        for word in words:
            where = next((w for w, text in entry.fields if word in fold(text)), None)
            if where is None:
                break
            hits.append(where)
        else:
            found[entry.id] = list(dict.fromkeys(hits))
    return found
