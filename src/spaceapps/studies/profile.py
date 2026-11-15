"""Perfil das tabelas de um envio, sem IA: abas, palpite de cabeçalho, amostras e estatística por coluna.

É o que a IA recebe no lugar das planilhas inteiras: pequeno o bastante para caber no contexto e
completo o bastante para ela propor como ler cada coluna.
"""

from __future__ import annotations

import csv
import datetime as dt
from dataclasses import asdict, dataclass, field
from pathlib import Path

from openpyxl import load_workbook

from ..ingest.common import is_blank, to_number, to_text

SAMPLE_ROWS = 12
MAX_COLUMNS = 60
MAX_CELL = 60


@dataclass
class ColumnProfile:
    indice: int
    cabecalho: str | None
    preenchidas: int
    numericas: int
    distintos: int
    exemplos: list[str]
    minimo: float | None = None
    maximo: float | None = None


@dataclass
class SheetProfile:
    arquivo: str
    aba: str | None  # None para CSV
    linhas: int
    colunas: int
    linha_cabecalho: int | None  # 1 = primeira linha
    amostra: list[tuple[int, list[str]]] = field(default_factory=list)  # (nº da linha, células)
    colunas_perfil: list[ColumnProfile] = field(default_factory=list)


def read_rows(path: Path, sheet: str | None = None) -> list[tuple]:
    """Linhas brutas de um CSV ou de uma aba de planilha."""
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", errors="replace", newline="") as f:
            sample = f.read(4096)
            f.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            except csv.Error:
                dialect = csv.excel
            return [tuple(row) for row in csv.reader(f, dialect)]
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        ws = workbook[sheet] if sheet else workbook.worksheets[0]
        return [tuple(row) for row in ws.iter_rows(values_only=True)]
    finally:
        workbook.close()


def sheet_names(path: Path) -> list[str | None]:
    if path.suffix.lower() == ".csv":
        return [None]
    workbook = load_workbook(path, read_only=True)
    try:
        return list(workbook.sheetnames)
    finally:
        workbook.close()


def _cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        return value.date().isoformat() if value.time() == dt.time() else value.isoformat()
    text = to_text(value) or ""
    return text if len(text) <= MAX_CELL else text[: MAX_CELL - 1] + "…"


def guess_header(rows: list[tuple]) -> int | None:
    """Primeira linha com maioria de texto seguida de uma linha com algum número (1-based)."""
    for i, row in enumerate(rows[:30]):
        filled = [c for c in row if not is_blank(c)]
        if len(filled) < 2:
            continue
        texts = sum(isinstance(c, str) and to_number(c) is None for c in filled)
        nxt = next((r for r in rows[i + 1 : i + 4] if any(not is_blank(c) for c in r)), ())
        has_numbers = any(to_number(c) is not None for c in nxt)
        if texts >= 0.6 * len(filled) and has_numbers:
            return i + 1
    return None


def profile_sheet(path: Path, rel: str, sheet: str | None) -> SheetProfile:
    rows = read_rows(path, sheet)
    nonempty = [(i + 1, r) for i, r in enumerate(rows) if any(not is_blank(c) for c in r)]
    width = min(max((len(r) for _, r in nonempty), default=0), MAX_COLUMNS)
    header = guess_header(rows)
    profile = SheetProfile(
        arquivo=rel, aba=sheet, linhas=len(nonempty), colunas=width, linha_cabecalho=header
    )
    profile.amostra = [(n, [_cell(c) for c in r[:width]]) for n, r in nonempty[:SAMPLE_ROWS]]
    body = [r for n, r in nonempty if header is None or n > header]
    head = rows[header - 1] if header else ()
    for j in range(width):
        values = [r[j] for r in body if j < len(r) and not is_blank(r[j])]
        numbers = [n for v in values if (n := to_number(v)) is not None]
        distinct = list(dict.fromkeys(_cell(v) for v in values))
        profile.colunas_perfil.append(
            ColumnProfile(
                indice=j,
                cabecalho=to_text(head[j]) if j < len(head) else None,
                preenchidas=len(values),
                numericas=len(numbers),
                distintos=len(distinct),
                exemplos=distinct[:6],
                minimo=min(numbers) if numbers else None,
                maximo=max(numbers) if numbers else None,
            )
        )
    return profile


def profile_files(files_dir: Path, tables: list[str]) -> list[SheetProfile]:
    """Perfil de cada aba de cada tabela (caminhos relativos a `files_dir`). Abas vazias ficam de fora."""
    out = []
    for rel in tables:
        path = files_dir / rel
        for sheet in sheet_names(path):
            profile = profile_sheet(path, rel, sheet)
            if profile.linhas:
                out.append(profile)
    return out


def as_prompt(profiles: list[SheetProfile]) -> str:
    """Texto compacto para a IA: uma seção por aba, com amostra e estatística de cada coluna."""
    parts = []
    for p in profiles:
        title = f"### {p.arquivo}" + (f" — aba '{p.aba}'" if p.aba else " (CSV)")
        parts.append(f"{title}\nlinhas não vazias: {p.linhas} · colunas: {p.colunas} · "
                     f"palpite de cabeçalho: linha {p.linha_cabecalho or 'não identificado'}")  # fmt: skip
        parts.append("amostra (nº da linha | células):")
        parts += [f"  {n:>4} | " + " | ".join(cells) for n, cells in p.amostra]
        parts.append("colunas (índice, cabeçalho, preenchidas, numéricas, distintos, faixa, exemplos):")
        for c in p.colunas_perfil:
            rng = f"{c.minimo:g}..{c.maximo:g}" if c.minimo is not None else "-"
            parts.append(f"  [{c.indice}] {c.cabecalho!r}: {c.preenchidas}, {c.numericas}, {c.distintos}, {rng}, "
                         f"{c.exemplos}")  # fmt: skip
        parts.append("")
    return "\n".join(parts)


def to_dicts(profiles: list[SheetProfile]) -> list[dict]:
    return [asdict(p) for p in profiles]
