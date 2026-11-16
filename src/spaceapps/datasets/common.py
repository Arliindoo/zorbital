"""Conversões compartilhadas pelas três investigações."""

from __future__ import annotations

import csv
import datetime as dt
import math
from dataclasses import dataclass, field
from pathlib import Path

import polars as pl

# Marcadores de "sem valor" encontrados nas fontes.
MISSING = {"", "-", "–", "none", "n/a", "na", "nan"}


def to_number(value: object) -> float | None:
    """Número quando a célula é um único número; None em qualquer outro caso."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value) if math.isfinite(value) else None
    text = str(value).strip()
    if text.lower() in MISSING:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def is_blank(value: object) -> bool:
    return value is None or str(value).strip().lower() in MISSING


def to_text(value: object) -> str | None:
    """Texto da célula como está na fonte, com espaços repetidos reduzidos."""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = " ".join(str(value).split())
    return text or None


def to_date(value: object) -> dt.date | None:
    """Datas das fontes: objeto do Excel, `m/d/aaaa` ou `m/d/aa`."""
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = to_text(value)
    if not text:
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def read_csv_rows(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


@dataclass
class Alerts:
    """Achados de qualidade: o que foi lido de forma diferente da célula original.

    Nada é corrigido por suposição. O valor original fica registrado aqui e o campo
    numérico correspondente fica vazio.
    """

    investigacao: str
    rows: list[dict] = field(default_factory=list)

    def add(self, teste_id: str, campo: str, valor_original: object, tipo: str, detalhe: str) -> None:
        self.rows.append(
            {
                "investigacao": self.investigacao,
                "teste_id": teste_id,
                "campo": campo,
                "valor_original": to_text(valor_original),
                "tipo": tipo,
                "detalhe": detalhe,
            }
        )

    def frame(self) -> pl.DataFrame:
        schema = dict.fromkeys(
            ("investigacao", "teste_id", "campo", "valor_original", "tipo", "detalhe"), pl.String
        )
        return pl.DataFrame(self.rows, schema=schema)


def numeric_or_alert(alerts: Alerts, teste_id: str, campo: str, value: object) -> float | None:
    """Converte para número; se a célula tem texto (ex.: `OR`, `>500`), registra o alerta."""
    number = to_number(value)
    if number is None and not is_blank(value):
        alerts.add(
            teste_id, campo, value, "valor_nao_numerico", "Texto em coluna numérica; mantido só no alerta."
        )
    return number
