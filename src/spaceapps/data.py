"""Carga e preparo dos dados."""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO

import plotly.express as px
import polars as pl

AGGREGATIONS = {
    "média": pl.Expr.mean,
    "soma": pl.Expr.sum,
    "mediana": pl.Expr.median,
    "mínimo": pl.Expr.min,
    "máximo": pl.Expr.max,
}

# Acima disso uma coluna de texto deixa de ser útil como dimensão de comparação.
MAX_CATEGORIES = 500


def load_example() -> pl.DataFrame:
    """Gapminder, o conjunto de exemplo que acompanha o Plotly."""
    return pl.from_pandas(px.data.gapminder()).drop("iso_alpha", "iso_num")


def load_file(file: BinaryIO | Path, name: str) -> pl.DataFrame:
    """Lê CSV ou Parquet; o formato sai da extensão de `name`."""
    suffix = Path(name).suffix.lower()
    if suffix == ".csv":
        return pl.read_csv(file, try_parse_dates=True)
    if suffix == ".parquet":
        return pl.read_parquet(file)
    raise ValueError(f"Formato não suportado: {suffix or name}. Use .csv ou .parquet.")


def numeric_columns(df: pl.DataFrame) -> list[str]:
    return [name for name, dtype in df.schema.items() if dtype.is_numeric()]


def category_columns(df: pl.DataFrame) -> list[str]:
    """Colunas de texto com cardinalidade baixa o bastante para comparar."""
    return [
        name
        for name, dtype in df.schema.items()
        if dtype in (pl.String, pl.Categorical, pl.Enum) and df[name].n_unique() <= MAX_CATEGORIES
    ]


def is_ordered(df: pl.DataFrame, column: str) -> bool:
    """Numérica ou temporal: dá para ligar os pontos numa linha."""
    dtype = df.schema[column]
    return dtype.is_numeric() or dtype.is_temporal()


def compare(
    df: pl.DataFrame,
    *,
    by: str,
    entities: list[str],
    x: str,
    measure: str,
    agg: str = "média",
) -> pl.DataFrame:
    """Tabela longa (x, by, measure) com a medida agregada por entidade e por x."""
    return (
        df.filter(pl.col(by).is_in(entities))
        .group_by(x, by)
        .agg(AGGREGATIONS[agg](pl.col(measure)))
        .sort(x, by)
    )


def summarize(table: pl.DataFrame, *, by: str, x: str, measure: str) -> pl.DataFrame:
    """Resumo por entidade: pontos, extremos, média e primeiro/último valor em x."""
    m = pl.col(measure)
    return (
        table.sort(x)
        .group_by(by, maintain_order=True)
        .agg(
            m.count().alias("pontos"),
            m.min().alias("mínimo"),
            m.max().alias("máximo"),
            m.mean().alias("média"),
            m.first().alias("primeiro"),
            m.last().alias("último"),
        )
        .sort(by)
    )
