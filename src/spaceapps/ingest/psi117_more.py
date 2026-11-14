"""PSI-117: as demais tabelas da investigação, além do diâmetro de extinção por pressão.

- `ReadMe_List_of_Data.xlsx`: catálogo das tabelas com as condições de cada uma.
- `PROCI_2023_Alkane_Extinction_Diameter_1atm.csv`: extinção a 1 atm de n-heptano, n-decano e
  n-dodecano, medida (Expt) e simulada (Sim), por diâmetro inicial da gota.
- `PROCI_2019_*_Cool_Flame.csv`: séries temporais do modelo numérico de uma gota de n-heptano.
"""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl
from openpyxl import load_workbook

from .common import Alerts, read_csv_rows, to_number, to_text

INVESTIGACAO = "PSI-117"
FUEL_CODES = {"C7": "n-heptano", "C10": "n-decano", "C12": "n-dodecano"}
FUEL_NAMES = {"n-heptane": "n-heptano", "n-decane": "n-decano", "n-dodecane": "n-dodecano"}


def load_readme(path: Path) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Uma linha por tabela citada no ReadMe. Os valores ficam como texto quando a fonte usa faixas
    ("0.5 - 3.0") ou palavras ("Balance")."""
    workbook = load_workbook(path, read_only=True, data_only=True)
    rows = list(workbook.worksheets[0].iter_rows(values_only=True))
    workbook.close()
    alerts, records, extra_gas = Alerts(INVESTIGACAO), [], None
    cell = lambda r, i: r[i] if i < len(r) else None  # noqa: E731
    for row in rows:
        if to_text(cell(row, 1)) == "Fuel":
            extra_gas = to_text(cell(row, 6))  # XO3 ou XHe, conforme o bloco
            continue
        data_file = to_text(cell(row, 8))
        if not data_file:
            continue
        xn2 = to_number(cell(row, 5))
        if xn2 is not None and xn2 > 1:
            alerts.add(data_file, "xn2", cell(row, 5), "fracao_suspeita",
                       f"XN2 = {xn2:g} numa coluna de fração molar (0–1): parece porcentagem. "
                       f"A coluna {extra_gas} diz '{to_text(cell(row, 6))}'.")  # fmt: skip
        records.append(
            {
                "arquivo": data_file,
                "combustivel": FUEL_NAMES.get(to_text(cell(row, 1)), to_text(cell(row, 1))),
                "d0_mm_texto": to_text(cell(row, 2)),
                "pressao_atm_texto": to_text(cell(row, 3)),
                "xo2_texto": to_text(cell(row, 4)),
                "xn2_texto": to_text(cell(row, 5)),
                "outro_gas": extra_gas,
                "outro_gas_valor_texto": to_text(cell(row, 6)) if extra_gas else None,
                "doi": to_text(cell(row, 9)),
                "figura": to_text(cell(row, 10)),
            }
        )
    return pl.DataFrame(records), alerts.frame()


def load_1atm(path: Path) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Blocos (combustível, Do, Dext_HF, Dext_CF) lado a lado; a 1ª coluna de cada bloco diz Expt ou Sim
    na primeira linha e fica vazia nas seguintes."""
    rows = read_csv_rows(path)
    header = [h.strip() for h in rows[0]]
    starts = [
        i
        for i, h in enumerate(header)
        if h in FUEL_CODES and header[i + 1 : i + 4] == ["Do", "Dext_HF", "Dext_CF"]
    ]
    if not starts:
        raise ValueError(f"{path.name}: blocos (C7|C10|C12, Do, Dext_HF, Dext_CF) não encontrados.")
    alerts, records = Alerts(INVESTIGACAO), []
    for start in starts:
        kind = None
        for line, row in enumerate(rows[1:], start=2):
            kind = to_text(row[start]) or kind if start < len(row) else kind
            d0, hot, cool = (to_number(row[start + k]) if start + k < len(row) else None for k in (1, 2, 3))
            if d0 is None:
                continue
            series = {"Expt": "Medição", "Sim": "Modelo"}.get(kind, kind)
            fuel = FUEL_CODES[header[start]]
            point = f"{fuel} {series} D0={d0:g}"
            if series == "Modelo" and hot == 0 and cool == 0:
                detail = (
                    "Simulação com extinção 0 nas duas chamas: provável ausência de chama nesse D0. Conferir."
                )
                alerts.add(point, "dext", "0 e 0", "valor_zero", detail)
            elif cool == 0:
                detail = "Chama fria com extinção 0: sem extinção visível (gota consumida) ou sem chama fria."
                alerts.add(point, "dext_fria_mm", 0, "valor_zero", detail)
            records.append(
                {
                    "combustivel": fuel,
                    "serie": series,
                    "natureza": {"Medição": "MEDIDO", "Modelo": "SIMULADO"}.get(series),
                    "d0_mm": d0,
                    "dext_quente_mm": hot,
                    "dext_fria_mm": cool,
                    "linha_fonte": line,
                }
            )
    return pl.DataFrame(records), alerts.frame()


SERIES_COLUMNS = {
    "Time(sec)": "t_s",
    "Diameter(mm)": "diametro_mm",
    "K(mm^2/sec)": "k_mm2_s",
    "T_max(K)": "t_max_k",
    "D_Tmax/D_drop": "razao_d_tmax_d_gota",
    "D_OHm/D_drop": "razao_d_ohmax_d_gota",
    "(D/Do)2": "d_d0_quadrado",
}


def load_series(path: Path) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Série temporal de um modelo de gota. Recusa cabeçalhos desconhecidos em vez de adivinhar."""
    rows = read_csv_rows(path)
    header = [h.strip() for h in rows[0]]
    if unknown := [h for h in header if h and h not in SERIES_COLUMNS]:
        raise ValueError(f"{path.name}: colunas não reconhecidas {unknown}.")
    scenario = "chama fria oscilatória" if "Oscillatory" in path.name else "chama fria estável"
    records = []
    for line, row in enumerate(rows[1:], start=2):
        values = {SERIES_COLUMNS[h]: to_number(v) for h, v in zip(header, row, strict=False) if h}
        if values.get("t_s") is not None:
            records.append({"cenario": scenario, "arquivo": re.sub(r"^PSI-\d+_[^_]+_", "", path.name),
                            "natureza": "SIMULADO", **values, "linha_fonte": line})  # fmt: skip
    return pl.DataFrame(records, infer_schema_length=None), Alerts(INVESTIGACAO).frame()
