"""Leitura do banco gerado por `spaceapps-build`. O dashboard nunca escreve nele."""

from __future__ import annotations

import json

import duckdb
import polars as pl

from .ingest.build import DB_PATH


def exists() -> bool:
    return DB_PATH.exists()


def query(sql: str, params: list | None = None) -> pl.DataFrame:
    with duckdb.connect(str(DB_PATH), read_only=True) as con:
        return pl.from_arrow(con.sql(sql, params=params or None).to_arrow_table())


def tables() -> list[str]:
    """Tabelas de dados e visões, sem as tabelas internas."""
    names = query("SELECT table_name FROM information_schema.tables ORDER BY table_type, table_name")
    return [n for n in names["table_name"] if n != "meta"]


def meta() -> dict:
    return json.loads(query("SELECT json FROM meta").item())


def investigation(inv_id: str) -> dict:
    return query("SELECT * FROM investigacoes WHERE id = ?", [inv_id]).row(0, named=True)


def alerts(inv_id: str | None = None) -> pl.DataFrame:
    where = "WHERE investigacao = ?" if inv_id else ""
    return query(
        f"SELECT * FROM alertas {where} ORDER BY investigacao, tipo, teste_id", [inv_id] if inv_id else []
    )
