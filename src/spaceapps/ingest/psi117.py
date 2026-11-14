"""PSI-117: diâmetro de extinção de gotas de n-dodecano (C12) por pressão, medido e modelado."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from .common import Alerts, read_csv_rows, to_number

INVESTIGACAO = "PSI-117"

# A fonte é "larga": pares (pressão, valor) lado a lado, separados por colunas vazias.
# Cada par vira linhas de uma tabela longa. O mapeamento sai do nome da coluna de valor.
SERIES = {
    "Dext_HF_EXPT": ("Chama quente", "Medição"),
    "Dext_HF_model": ("Chama quente", "Modelo"),
    "Dext_CF_EXPT": ("Chama fria", "Medição"),
    "Dext_CF_Model": ("Chama fria", "Modelo"),
    "Dext_CF_ErrorBar+": ("Chama fria", "Limite superior"),
    "Dext_CF_ErrorBar-": ("Chama fria", "Limite inferior"),
}
NATUREZA = {
    "Medição": "MEDIDO",
    "Modelo": "SIMULADO",
    "Limite superior": "INCERTEZA",
    "Limite inferior": "INCERTEZA",
}


def load(path: Path) -> tuple[pl.DataFrame, pl.DataFrame]:
    rows = read_csv_rows(path)
    header = [h.strip() for h in rows[0]]
    alerts, records = Alerts(INVESTIGACAO), []

    pairs = [
        (i - 1, i, SERIES[h]) for i, h in enumerate(header) if h in SERIES and header[i - 1] == "P (atm)"
    ]
    if len(pairs) != len(SERIES):
        raise ValueError(f"{path.name}: esperados {len(SERIES)} pares pressão/valor, achados {len(pairs)}.")

    for line, x in enumerate(rows[1:], start=2):
        for p_col, v_col, (flame, series) in pairs:
            if v_col >= len(x):
                continue
            pressure, diameter = to_number(x[p_col]), to_number(x[v_col])
            if pressure is None or diameter is None:
                continue
            records.append(
                {
                    "tipo_chama": flame,
                    "serie": series,
                    "natureza": NATUREZA[series],
                    "pressao_atm": pressure,
                    "diametro_extincao_mm": diameter,
                    "coluna_fonte": header[v_col],
                    "linha_fonte": line,
                }
            )
    table = pl.DataFrame(records)

    # Duas medições na mesma pressão: a fonte não diz a qual delas a barra de erro se refere.
    repeated = (
        table.filter(pl.col("serie") == "Medição")
        .group_by("tipo_chama", "pressao_atm")
        .len()
        .filter(pl.col("len") > 1)
    )
    for flame, pressure, n in repeated.iter_rows():
        alerts.add(
            f"{flame} {pressure:g} atm", "diametro_extincao_mm", f"{n} medições", "medicao_repetida",
            "Mais de uma medição na mesma pressão; a barra de erro da fonte não diz a qual se refere.",
        )  # fmt: skip
    zeros = table.filter((pl.col("diametro_extincao_mm") == 0) & (pl.col("serie") == "Medição"))
    for flame, pressure in zeros.select("tipo_chama", "pressao_atm").iter_rows():
        alerts.add(
            f"{flame} {pressure:g} atm", "diametro_extincao_mm", 0, "valor_zero",
            "Diâmetro zero: pode indicar ausência de chama fria nessa pressão. Confirmar no artigo.",
        )  # fmt: skip
    return table, alerts.frame()
