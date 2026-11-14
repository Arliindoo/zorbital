"""Uma pasta `dados/` sintética, nos formatos das fontes reais, e o banco gerado a partir dela."""

import datetime as dt
import shutil
from pathlib import Path

import pytest
from openpyxl import Workbook

from spaceapps import db
from spaceapps.ingest import build

FLEX_HEADER = (
    "FLEX Test #,FLEX Identifier,Test Date,Test GMT,Fuel,Ambient pressure; mmHg,"
    "O initial ambient composition; mole fraction,N initial ambient composition; mole fraction,"
    "CO initial ambient composition; mole fraction,He initial ambient composition; mole fraction,"
    "Droplet initial diameter; mm,Visible flame extinction diameter; mm,Burning rate; mm,Burn time; s,Test end"
)
FLEX_ROWS = [
    "1,20CAL08,3/5/2009,17:22:03,Methanol,757.7,0.21,0.79,0,0,1.69,0.89,0.52,4.3,Disruption",
    "2,20CAL10,3/5/2009,19:20:06,Methanol,762,0.21,0.79,0,0,1.86,0.94,0.6,5,Extinction",
    "29,178R001,11/13/09,13:11:23,Methanol,766.9,0.3,0.7,0,0,2.57,,0.74,10.4,Completion",
    "83,X,2/4/2010,2:00:00,Methanol,760,0.15,0.85,0,0,–,,0.4,9,Extinction",
]
PSI117 = """P (atm),Dext_HF_EXPT,,P (atm),Dext_HF_model,,P (atm),Dext_CF_EXPT,,P (atm),Dext_CF_Model,,P (atm),Dext_CF_ErrorBar+,,P (atm),Dext_CF_ErrorBar-
0.5,3.48,,0.5,3.43,,0.5,1.89,,0.5,1.19,,0.5,2.29,,0.5,0.66
1,3.56,,1,3.68,,1,0.39,,1,0.25,,1,0.67,,1,0.15
3,3.56,,3,3.94,,1,0.48,,3,0.03,,3,0,,3,0
,,,,,,3,0,,,,,,,,,
"""
BASS_HEADER = [
    "Actual Date", "GMT 2014-", "Test no.", "Sample no.", "Material", "Flow restrictor", "Fan display",
    "Air display", "Radiometer gain", "total frames shot", "calibrated initial O2", "calibrated final O2",
    "Initial CO2", "Final CO2", "Initial CO (ppm)", "Final CO (ppm)",
]  # fmt: skip
BASS_SHEETS = {
    "Bhattacharjee": [
        [dt.datetime(2014, 2, 19), 50, "B1", 147, "100 micron pmma film, 2 cm wide", 2, 62, 5, 50, 57, 22.2, 22.2, 0.44, 0.44, 0, 6],
        [dt.datetime(2014, 2, 19), 50, "B2", 155, "200 micron pmma film, 2 cm wide", 2, 62, 5, 50, "none", 22.2, 1.6, 0.44, None, 6, None],
    ],
    "Olson": [
        [dt.datetime(2014, 2, 18), 49, "O1", 207, '1/4" clear rod', 2, "89,62,50,41", "20,10,5", 50, 62, 22.2, 21.7, 0.44, 0.85, -1, 51],
        [dt.datetime(2014, 7, 8), 189, "O4", "216m", '3/8"clear rod', 2, "5, 0.7 ext", "5", 250, 249, 14.8, 13.6, 0.72, 1.72, 290, "OR"],
    ],
    "T'ien": [
        [dt.datetime(2018, 6, 24), 175, "T9", "133M", "2 cm SIBAL", 2, "pot 2.5", 10, 250, 48, 16.4, 16.4, 0.3, 0.31, 0, 9],
    ],
}  # fmt: skip


def write_dados(root: Path) -> Path:
    files = root / "dados"
    (files / "Zorbital" / "arquivos").mkdir(parents=True)
    (files / "Zorbital" / "arquivos" / "01_FLEX_amostra_verificada.csv").write_text(
        "\n".join([FLEX_HEADER, *FLEX_ROWS]) + "\n", encoding="utf-8"
    )
    (files / "Zorbital" / "arquivos" / "03_PSI117_extincao_C12_arquivo_referencia.csv").write_text(PSI117)
    (files / "Zorbital" / "LEIA_PRIMEIRO.md").write_text("# leia\n")
    workbook = Workbook()
    workbook.remove(workbook.active)
    for title, rows in BASS_SHEETS.items():
        sheet = workbook.create_sheet(title)
        sheet.append(BASS_HEADER)
        for row in rows:
            sheet.append(row)
    workbook.save(files / "BASS-II Test Matrix by PI Final.xlsx")
    shutil.copy(files / "BASS-II Test Matrix by PI Final.xlsx", files / "Zorbital" / "copia.xlsx")
    return files


@pytest.fixture(scope="session")
def built_db(tmp_path_factory):
    root = tmp_path_factory.mktemp("projeto")
    path = root / "data" / "zorbital.duckdb"
    build.build(write_dados(root), path)
    return path


@pytest.fixture
def use_db(built_db, monkeypatch):
    """Aponta o dashboard para o banco sintético."""
    monkeypatch.setattr(db, "DB_PATH", built_db)
    return built_db
