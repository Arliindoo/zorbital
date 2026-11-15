"""Arquivos para o explorador livre: o exemplo do Plotly e os enviados pela pessoa.

A comparação por séries roda no navegador (frontend/src/lib/explore.ts)."""

from __future__ import annotations

import gzip
from importlib import resources
from pathlib import Path
from typing import BinaryIO

import polars as pl


def load_example() -> pl.DataFrame:
    """Gapminder, o conjunto de exemplo que vem no pacote do Plotly (lido direto, sem pandas)."""
    source = resources.files("plotly") / "package_data" / "datasets" / "gapminder.csv.gz"
    with source.open("rb") as raw, gzip.open(raw) as csv:
        return pl.read_csv(csv.read()).select("country", "continent", "year", "lifeExp", "pop", "gdpPercap")


def load_file(file: BinaryIO | Path, name: str) -> pl.DataFrame:
    """Lê CSV ou Parquet; o formato sai da extensão de `name`."""
    suffix = Path(name).suffix.lower()
    if suffix == ".csv":
        return pl.read_csv(file, try_parse_dates=True)
    if suffix == ".parquet":
        return pl.read_parquet(file)
    raise ValueError(f"Formato não suportado: {suffix or name}. Use .csv ou .parquet.")
