"""PSI-25 BASS-II: queima de materiais sólidos na ISS, com O2 e ventilação variados."""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl
from openpyxl import load_workbook

from ..datasets.common import Alerts, numeric_or_alert, to_date, to_number, to_text

INVESTIGACAO = "PSI-25"
INCH_MM = 25.4

# Ordem das colunas na matriz original (uma aba por pesquisador, 16 colunas).
FIELDS = (
    "data", "gmt_dia", "teste_id", "amostra_id", "material_original", "restritor_fluxo",
    "ventilador_display", "ar_display", "ganho_radiometro", "quadros_total",
    "o2_inicial_pct", "o2_final_pct", "co2_inicial_pct", "co2_final_pct", "co_inicial_ppm", "co_final_ppm",
)  # fmt: skip
GAS_FIELDS = FIELDS[10:]


def classify_material(text: str | None) -> dict:
    """Categorias tiradas do texto livre da coluna Material, sem completar o que não está escrito.

    Hastes e filmes sem o nome do material ficam como "Não escrito na fonte": no BASS-II eles
    provavelmente são PMMA, mas isso precisa vir do relatório, não daqui.
    """
    t = (text or "").lower().replace("”", '"').replace("“", '"')
    if "pmma" in t:
        categoria = "PMMA"
    elif "sibal" in t:
        categoria = "SIBAL (tecido)"
    elif "nomex" in t:
        categoria = "Nomex (tecido)"
    elif "wax" in t or "candle" in t:
        categoria = "Cera (vela)"
    else:
        categoria = "Não escrito na fonte"

    if "rod" in t:
        geometria = "Haste"
    elif "spherical" in t:
        geometria = "Seção esférica"
    elif "candle" in t:
        geometria = "Vela"
    elif "sibal" in t or "nomex" in t:
        geometria = "Tecido"
    elif "film" in t or "micron" in t:
        geometria = "Filme"
    elif "slab" in t or re.search(r"\d\s*mm\s*thick|thick.*\d\s*mm|\d\s*mm\b", t):
        geometria = "Placa"
    else:
        geometria = "Não identificada"

    espessura = None
    if m := re.search(r"(\d+(?:\.\d+)?)\s*micron", t):
        espessura = float(m[1]) / 1000
    elif geometria in ("Filme", "Placa") and (m := re.search(r"(\d*\.?\d+)\s*mm", t)):
        espessura = float(m[1])

    diametro = None
    if geometria == "Haste":
        if m := re.search(r"(\d+)\s*/\s*(\d+)", t):
            diametro = round(int(m[1]) / int(m[2]) * INCH_MM, 2)
        elif m := re.search(r"(\d*\.\d+)\s*\"", t):
            diametro = round(float(m[1]) * INCH_MM, 2)
    elif geometria == "Seção esférica" and (m := re.search(r"(\d+(?:\.\d+)?)\s*cm", t)):
        diametro = float(m[1]) * 10

    largura = None
    if geometria in ("Filme", "Placa", "Tecido") and (m := re.search(r"(\d+(?:\.\d+)?)\s*cm", t)):
        largura = float(m[1])

    cor = "Transparente" if "clear" in t else "Preta" if re.search(r"\bblac?k?\b", t) else None
    faces = 1 if "1 sided" in t else 2 if "2 sided" in t else None
    return {
        "material_categoria": categoria,
        "geometria": geometria,
        "espessura_mm": espessura,
        "largura_cm": largura,
        "diametro_mm": diametro,
        "cor": cor,
        "faces_queimando": faces,
    }


def load(path: Path) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Lê a matriz de testes original (xlsx, uma aba por pesquisador)."""
    workbook = load_workbook(path, read_only=True, data_only=True)
    alerts, records = Alerts(INVESTIGACAO), []
    for sheet in workbook.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        header = rows[0]
        if len(header) < len(FIELDS):
            raise ValueError(f"{path.name}, aba {sheet.title}: esperadas {len(FIELDS)} colunas.")
        # A aba Olson avisa no cabeçalho que os 3 últimos testes são de 2016.
        exceptions_2016 = "2016" in str(header[1])
        for x in rows[1:]:
            cells = dict(zip(FIELDS, x, strict=False))
            test = to_text(cells["teste_id"])
            if not test:
                continue
            records.append(_record(sheet.title, test, cells, alerts, exceptions_2016))
    workbook.close()
    return pl.DataFrame(records, infer_schema_length=None), alerts.frame()


def _record(pi: str, test: str, c: dict, alerts: Alerts, exceptions_2016: bool) -> dict:
    num = lambda campo: numeric_or_alert(alerts, test, campo, c[campo])  # noqa: E731
    date, gmt = to_date(c["data"]), to_number(c["gmt_dia"])
    if date and date.year != 2014 and not (exceptions_2016 and date.year == 2016):
        alerts.add(
            test, "data", date, "data_suspeita", f"Ano {date.year} numa campanha de 2014; GMT dia {gmt:g}."
        )
    elif date and gmt and date.year == 2014 and date.timetuple().tm_yday != int(gmt):
        alerts.add(
            test,
            "data",
            date,
            "data_x_gmt",
            f"Data é o dia {date.timetuple().tm_yday} do ano, GMT diz {gmt:g}.",
        )

    gases = {campo: num(campo) for campo in GAS_FIELDS}
    for campo in ("co_inicial_ppm", "co_final_ppm"):
        if (v := gases[campo]) is not None and v < 0:
            alerts.add(test, campo, v, "valor_negativo", "Concentração negativa: provável desvio do sensor.")
    o2i, o2f = gases["o2_inicial_pct"], gases["o2_final_pct"]
    if o2i is not None and o2f is not None and abs(o2i - o2f) > 5:
        alerts.add(
            test, "o2_final_pct", o2f, "variacao_extrema", f"O2 caiu de {o2i:g}% para {o2f:g}%: revisar."
        )

    fan, air = to_text(c["ventilador_display"]), to_text(c["ar_display"])
    return {
        "teste_id": test,
        "pesquisador": pi,
        "data": date,
        "gmt_dia": int(gmt) if gmt is not None else None,
        "amostra_id": to_text(c["amostra_id"]),
        "material_original": to_text(c["material_original"]),
        **classify_material(to_text(c["material_original"])),
        "restritor_fluxo": to_number(c["restritor_fluxo"]),
        # Ventilador e ar trazem sequências de ajustes digitadas à mão ("89,62,50,41").
        # O texto fica como está; o número só existe quando a célula tem um valor único.
        # O display NÃO é velocidade calibrada em cm/s.
        "ventilador_display": fan,
        "ventilador_display_unico": to_number(c["ventilador_display"]),
        "ar_display": air,
        "ar_display_unico": to_number(c["ar_display"]),
        "ajustes_durante_teste": bool(re.search(r"[,;>]|down|incr|decr", f"{fan or ''} {air or ''}")),
        "ganho_radiometro": to_text(c["ganho_radiometro"]),
        "quadros_total": to_number(c["quadros_total"]),
        **gases,
        "delta_o2_pp": round(o2f - o2i, 3) if o2i is not None and o2f is not None else None,
        "delta_co2_pp": _delta(gases["co2_inicial_pct"], gases["co2_final_pct"]),
        "delta_co_ppm": _delta(gases["co_inicial_ppm"], gases["co_final_ppm"]),
    }


def _delta(start: float | None, end: float | None) -> float | None:
    return round(end - start, 3) if start is not None and end is not None else None
