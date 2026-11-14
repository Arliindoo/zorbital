"""PSI-39 CFI — Cool Flames Investigation: gotas de n-dodecano e misturas na ISS (2017–2020).

A fonte é a planilha `CFI_DataSummary_Spreadsheet_Jan2021.xlsx`, com uma linha por ensaio em cada
aba, ligadas pelo `Flex Number`: condições (Master Sheet), resultados (DATA), ignição (Igniter),
câmeras (Camera Settings) e comentários do operador (Comments).
"""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl
from openpyxl import load_workbook

from .common import Alerts, is_blank, numeric_or_alert, to_date, to_number, to_text

INVESTIGACAO = "PSI-39"

FUELS = {
    "C12H26": "n-dodecano",
    "[.75]/[.25] C12H26/iso-dodecane": "n-dodecano/iso-dodecano 75/25",
    "[.60]/[.40] C12H26/iso-dodecane": "n-dodecano/iso-dodecano 60/40",
    "Farnesane": "Farnesano",
}

# coluna da aba DATA → nome no banco. Os rótulos de radiometria seguem a fonte: a unidade não é
# informada na planilha.
DATA_COLUMNS = {
    "D0 ( mm )": "d0_mm",
    "Dext, hot ( mm )": "dext_quente_mm",
    "khot ( mm^2/s )": "k_quente_mm2_s",
    "kcool ( mm^2/s )": "k_fria_mm2_s",
    "Dext,cool ( mm )": "dext_fria_mm",
    "Pressure (atm)": "pressao_atm",
    "Reignitions": "reignicoes",
    "Extrap CF?": "dext_fria_extrapolado",
    "HF Burn Time": "tempo_chama_quente",
    "Peak HF Rad": "rad_pico_chama_quente",
    "Peak Water Vapor Rad": "rad_pico_vapor_agua",
    "Rad Ratio": "razao_rad",
    "2.5mm rad": "rad_2_5mm",
    "2.5mm narrow": "rad_2_5mm_estreita",
    "CF Rad Ratio": "razao_rad_chama_fria",
    "2.5mm CF": "rad_2_5mm_chama_fria",
    "2.5mm time": "tempo_2_5mm",
    "Actual D": "actual_d_rotulo_fonte",
    "Completed Analysis?": "analise_completa",
}


def _sheet(workbook, name: str) -> tuple[list[str], dict[str, tuple]]:
    rows = list(workbook[name].iter_rows(values_only=True))
    header = [" ".join(str(h).split()) if h is not None else "" for h in rows[0]]
    body = {}
    for row in rows[1:]:
        if row and not is_blank(row[0]):
            body[to_text(row[0])] = row
    return header, body


def _unit_value(text: object, unit: str) -> float | None:
    """'12 w' → 12; '3700 ms' → 3700. None se não for esse formato."""
    match = re.fullmatch(rf"\s*([\d.]+)\s*{unit}\s*", str(text or ""), re.I)
    return float(match[1]) if match else to_number(text)


def load(path: Path) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Devolve ensaios (condições + resultados + ignição + comentário), câmeras e alertas."""
    workbook = load_workbook(path, read_only=True, data_only=True)
    _, master = _sheet(workbook, "Master Sheet")
    data_header, data = _sheet(workbook, "DATA")
    _, igniter = _sheet(workbook, "Igniter")
    camera_header, cameras = _sheet(workbook, "Camera Settings")
    _, comments = _sheet(workbook, "Comments")
    workbook.close()

    alerts = Alerts(INVESTIGACAO)
    positions = {name: i for i, name in enumerate(data_header) if name in DATA_COLUMNS}
    if missing := set(DATA_COLUMNS) - set(positions):
        raise ValueError(f"{path.name}, aba DATA: colunas ausentes {sorted(missing)}")

    records = []
    for test, m in master.items():
        if test not in data:
            alerts.add(
                test, "(ensaio)", test, "sem_resultados", "Ensaio na Master Sheet sem linha na aba DATA."
            )
        d = data.get(test, ())
        values = {DATA_COLUMNS[name]: (d[i] if i < len(d) else None) for name, i in positions.items()}
        result = {
            col: numeric_or_alert(alerts, test, col, values[col])
            for col in DATA_COLUMNS.values()
            if col not in ("analise_completa", "dext_fria_extrapolado", "reignicoes")
        }
        pressure_text = to_text(m[4])
        pressure_master = to_number(re.sub(r"[^\d.]", "", pressure_text or ""))
        if result["pressao_atm"] is not None and pressure_master is not None:
            if abs(result["pressao_atm"] - pressure_master) > 1e-9:
                alerts.add(test, "pressao_atm", pressure_text, "pressao_divergente",
                           f"Master Sheet diz {pressure_text}, DATA diz {result['pressao_atm']:g} atm.")  # fmt: skip

        # Diâmetro de extinção da chama fria igual a 0: os comentários descrevem "a gota desaparece,
        # sem extinção visível". Não é um diâmetro medido de 0 mm; fica vazio e marcado.
        cool_zero = result["dext_fria_mm"] == 0
        if cool_zero:
            result["dext_fria_mm"] = None
            detail = "Zero na fonte: sem extinção visível da chama fria (gota consumida). Não é 0 mm medido."
            alerts.add(test, "dext_fria_mm", 0, "valor_zero", detail)
        if to_text(m[0]) != str(m[0]):
            alerts.add(
                test, "teste_id", repr(m[0]), "espacos_no_id", "Identificador com espaço extra na fonte."
            )

        fuel_original = to_text(m[9])
        ign = igniter.get(test, ())
        records.append(
            {
                "teste_id": test,
                "data": to_date(m[1]),
                "hora_local": to_text(m[2]),
                "cir_id": to_text(m[3]),
                "pressao_texto_fonte": pressure_text,
                "oxigenio_fracao": to_number(m[5]),
                "nitrogenio_fracao": to_number(m[6]),
                "helio_fracao": to_number(m[7]),
                "diluente": "Hélio" if (to_number(m[7]) or 0) > 0 else "Nitrogênio",
                "fibra": {"yes": True, "no": False}.get((to_text(m[8]) or "").lower()),
                "combustivel_original": fuel_original,
                "combustivel": FUELS.get(fuel_original, fuel_original),
                **result,
                "dext_fria_zero_na_fonte": cool_zero,
                "dext_fria_extrapolado": to_number(values["dext_fria_extrapolado"]) == 1
                if not is_blank(values["dext_fria_extrapolado"]) else None,
                "reignicoes": int(n) if (n := to_number(values["reignicoes"])) is not None else None,
                "analise_completa": (to_text(values["analise_completa"]) or "").lower() == "yes",
                "ignicao_potencia_w": _unit_value(ign[1] if len(ign) > 1 else None, "w"),
                "ignicao_tempo_ms": _unit_value(ign[2] if len(ign) > 2 else None, "ms"),
                "comentario": to_text(comments.get(test, (None, None))[1]),
            }
        )  # fmt: skip

    camera_names = [h for h in camera_header[1:] if h]
    camera_rows = [
        {"teste_id": test, **{name: to_text(row[i + 1]) for i, name in enumerate(camera_names)}}
        for test, row in cameras.items()
    ]
    return (
        pl.DataFrame(records, infer_schema_length=None),
        pl.DataFrame(camera_rows, infer_schema_length=None),
        alerts.frame(),
    )
