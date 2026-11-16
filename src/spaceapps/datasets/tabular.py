"""Raw CSV and workbook reading shared by profiling and ingestion."""

import csv
from pathlib import Path

from openpyxl import load_workbook


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
