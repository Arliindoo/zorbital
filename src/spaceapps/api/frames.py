"""Tabelas Polars → JSON para o front-end, com o tipo de cada coluna."""

from __future__ import annotations

import json

import polars as pl


def kind(dtype: pl.DataType) -> str:
    """Tipo simplificado que o front usa para formatar e escolher eixos."""
    if dtype == pl.Boolean:
        return "boolean"
    if dtype.is_numeric():
        return "number"
    if dtype == pl.Date:
        return "date"
    if dtype.is_temporal():
        return "datetime"
    if dtype in (pl.String, pl.Categorical, pl.Enum):
        return "string"
    return "other"


def dataset(frame: pl.DataFrame) -> dict:
    """`{"columns": [{name, kind}], "rows": [{coluna: valor}]}`.

    As linhas saem do `write_json` do Polars: datas viram texto ISO e NaN vira null, então o JSON é
    sempre válido.
    """
    rows = json.loads(frame.write_json()) if frame.height else []
    return {
        "columns": [{"name": name, "kind": kind(dtype)} for name, dtype in frame.schema.items()],
        "rows": rows,
    }


def frame_from_rows(rows: list[dict], columns: list[str] | None = None) -> pl.DataFrame:
    """Reconstrói uma tabela enviada pelo front (as linhas filtradas da tela)."""
    if not rows:
        return pl.DataFrame(schema=dict.fromkeys(columns or [], pl.String))
    frame = pl.DataFrame(rows, infer_schema_length=None, strict=False)
    return frame.select(columns) if columns and set(columns) <= set(frame.columns) else frame
