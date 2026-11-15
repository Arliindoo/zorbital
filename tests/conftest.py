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
    write_cfi(files)
    write_psi117_more(files)
    write_psi142(files)
    write_metadados(files)
    return files


ISA = """STUDY
Study Identifier\t"{psi}"
Study Title\t"{title}"
Comment[Objective]\t"Map the limits:
    1) first item.
    2) second item."
Comment[Experiment Hardware]\t"{hardware}"
Comment[Investigation Start Date]\t"08-01-2007"
Comment[Investigation End Date]\t"07-31-2016"
Study Design Type\t"Droplet"\t"Extinction"
Study Publication Title\t"Paper one"\t"Paper two"
Study Publication DOI\t"10.1/one"\t""
Comment[Study Publication Link]\t""\t"https://ntrs.nasa.gov/citations/2"
Study Person Last Name\t"Pessoa"
Study Person Email\t"pessoa@exemplo.org"
"""


def write_metadados(files: Path) -> None:
    """Metadados do portal como chegam: um .tar.gz com um zip por investigação."""
    import io
    import tarfile
    import zipfile

    studies = {"PSI-69_metadata_FLEX.zip": ("PSI-69", "Flame Extinguishment Experiment",
                                            "Combustion Integrated Rack (CIR), Multi-user Droplet Apparatus (MDCA)"),
               "PSI-39_metadata_CFI.zip": ("PSI-39", "Cool Flames Investigation",
                                           "Multi-User Droplet Combustion Apparatus (MDCA)")}  # fmt: skip
    (files / "metadados").mkdir(exist_ok=True)
    with tarfile.open(files / "metadados" / "DadosPsi.tar.gz", "w:gz") as archive:
        for name, (psi, title, hardware) in studies.items():
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as inner:
                inner.writestr("i_Investigation.txt", ISA.format(psi=psi, title=title, hardware=hardware))
                inner.writestr(f"s_{psi}.txt", "")
            info = tarfile.TarInfo(name)
            info.size = len(buffer.getvalue())
            archive.addfile(info, io.BytesIO(buffer.getvalue()))


# --- CFI (PSI-39): planilha com as 5 abas, ligadas pelo Flex Number --------------------------------
CFI_DATA_HEADER = [
    "Flex Number",
    "D0 ( mm )",
    "Dext, hot ( mm )",
    " khot ( mm^2/s )",
    "kcool ( mm^2/s )",
    "Dext,cool ( mm )",
    "Pressure (atm)",
    "Reignitions",
    "Extrap CF?",
    "HF Burn Time",
    "Peak HF Rad",
    "Peak Water Vapor Rad",
    "Rad Ratio",
    "2.5mm rad",
    "2.5mm narrow",
    "CF Rad Ratio",
    "2.5mm CF",
    "2.5mm time",
    "Actual D",
    "Completed Analysis?",
]
# (id, data, pressão texto, O2, N2, He, fibra, combustível, D0, Dext quente, Dext fria, pressão, completa)
CFI_TESTS = [
    (1206, dt.datetime(2017, 3, 9), "1 atm", 0.21, 0.79, 0, "No", "C12H26", 4.039, 3.577, 0.497, 1, "Yes"),
    (1251, dt.datetime(2017, 4, 2), "1 atm", 0.21, 0.79, 0, "Yes", "C12H26", 4.137, 3.571, 2.972, 1, "Yes"),
    (1240, dt.datetime(2017, 3, 30), ".5 atm ", 0.21, 0.79, 0, "Yes", "C12H26", 4.081, 3.485, None, 0.5, "No"),
    (1300, dt.datetime(2018, 1, 10), "3 atm", 0.21, 0.79, 0, "Yes", "C12H26", 4.2, 3.8, 0, 3, "Yes"),
    ("1274A ", dt.datetime(2017, 6, 1), "1 atm", 0.21, 0.5, 0.29, None, "[.75]/[.25] C12H26/iso-dodecane ", 4.5, 4.0, 0.6, 1, "No"),
]  # fmt: skip


def write_cfi(files: Path) -> None:
    wb = Workbook()
    master = wb.active
    master.title = "Master Sheet"
    master.append(
        [
            "Flex Number",
            "Test Date",
            "Local Time",
            "CIR ",
            "Pressure",
            "Oxygen",
            "Nitrogen",
            "Helium",
            "Fiber",
            "Fuel ",
        ]
    )
    data, igniter, cameras, comments = (
        wb.create_sheet(n) for n in ("DATA", "Igniter", "Camera Settings", "Comments")
    )
    data.append(CFI_DATA_HEADER)
    igniter.append(["Flex Number", "Ignition Power ( W )", "Ignition Time ( ms )"])
    cameras.append(["Flex Number", "llumination ", "HF Gain", "CF Gain "])
    comments.append(["Flex Number", "Comments "])
    for i, (fid, date, ptext, o2, n2, he, fiber, fuel, d0, hot, cool, p, done) in enumerate(CFI_TESTS):
        master.append([fid, date, "01:00:00 pm est", f"f{i:03d}", ptext, o2, n2, he, fiber, fuel])
        data.append(
            [
                fid,
                d0,
                hot,
                0.38,
                0.39,
                cool,
                p,
                0,
                0,
                10.5,
                22.0,
                8.1,
                0.37,
                3.2,
                1.9,
                0.6,
                None,
                1.8,
                2.5,
                done,
            ]
        )
        igniter.append([fid, "12 w", "3700 ms"])
        cameras.append([fid, 70, 30000, 60000])
        comments.append(
            [fid, "Good deployment. No visible cool flame extinction." if cool == 0 else "Good burn."]
        )
    wb.save(files / "CFI_DataSummary_Spreadsheet_Jan2021.xlsx")
    # o CSV do portal: subconjunto da Master Sheet (não deve ser carregado)
    (files / "PSI-39_Experimental table_CFI.csv").write_text(
        "Flex Number,Test Date,Local Time,CIR ,Pressure,Oxygen,Nitrogen,Helium,Fiber,Fuel \n"
        "1206,9-Mar-17,01:00:00 pm est,f000,1 atm,0.21,0.79,0,No,C12H26\n"
    )


# --- PSI-117: ReadMe, extinção a 1 atm e série temporal do modelo -----------------------------------
def write_psi117_more(files: Path) -> None:
    prefix = "PSI-117_Analyzed Data_"
    # o original oficial da tabela C12 (com BOM, como no portal): deve vencer a cópia do pacote
    (files / f"{prefix}PROCI_2023_C12_Extinction_Diameter_vs_pressure.csv").write_text(
        "\ufeff" + PSI117, encoding="utf-8"
    )
    (files / f"{prefix}PROCI_2023_Alkane_Extinction_Diameter_1atm.csv").write_text(
        "C7,Do,Dext_HF,Dext_CF,,C12,Do,Dext_HF,Dext_CF,,C12,Do,Dext_HF,Dext_CF\n"
        "Expt,3.91,3.28,1.3,,Expt,4.137,3.571,0,,Sim,2,0,0\n"
        ",3.557,2.794,1.214,,,4.039,3.577,0.497,,,4,3.41,0.43\n"
    )
    (files / f"{prefix}PROCI_2019_Oscillatory_Cool_Flame.csv").write_text(
        "Time(sec),Diameter(mm),K(mm^2/sec),T_max(K),D_Tmax/D_drop,D_OHm/D_drop,(D/Do)2\n"
        "0,0.5,-3.21E-02,600,20.2,1,1\n0.1,0.49,0.1,700,10,5,0.96\n0.2,0.47,0.12,750,8,4,0.88\n"
    )
    wb = Workbook()
    ws = wb.active
    ws.append([None, "Fuel", "do (mm)", "P (atm)", "XO2", "XN2", "XO3", None, "Data File", "Reference"])
    ws.append(
        [
            None,
            "n-heptane",
            0.5,
            1,
            0.1,
            85,
            "Balance",
            None,
            "PROCI_2019_Oscillatory_Cool_Flame",
            "https://doi.org/x",
            "Fig. 1",
        ]
    )
    ws.append([None, "Fuel", "do (mm)", "P (atm)", "XO2", "XN2"])
    ws.append(
        [
            None,
            "n-dodecane",
            4,
            "0.5 - 3.0",
            0.21,
            0.79,
            None,
            None,
            "PROCI_2023_C12_Extinction_Diameter_vs_pressure",
            "https://doi.org/y",
            "Fig. 7",
        ]
    )
    ws.append(
        [None, "n-dodecane", 4, 1, 0.21, 0.79, None, None, "MST_2024_Dext", "https://doi.org/z", "Fig. 5"]
    )
    wb.save(files / f"{prefix}ReadMe_List_of_Data.xlsx")


# --- PSI-142: pontos de figuras em 8 abas + CSV de metadados ----------------------------------------
def write_psi142(files: Path) -> None:
    wb = Workbook()
    summary = wb.active
    summary.title = "data summary"
    summary.append([None, "Data ID", "Journal publication", "Figure # (in paper)", "Data description"])
    for cid, paper, fig, desc in [
        (1, "Reuter 2017", 4, "cool diffusion flame extinction limits, no ozone"),
        (2, "Reuter 2017", 5, "cool diffusion flame extinction limits, with ozone"),
        (3, "Reuter 2017", 7, "hot diffusion flame extinction limits, no ozone"),
        (4, "Reuter 2019", 2, "premixed flame extinction limits"),
        (5, "Yehia 2018", 8, "CH2O PLIF and thermometry"),
        (6, "Yehia 2019", 2, "alkane chemiluminescence"),
        (7, "Yehia 2019", 7, "nc12 chemiluminescence"),
        (8, "Yehia 2019", 9, "nc12 thermometry"),
    ]:
        summary.append([None, cid, paper, fig, desc])
    for cid in (1, 2, 3):
        ws = wb.create_sheet(f"data ID {cid}")
        ws.append([None, None, f"Data ID: {cid}"])
        for fuel, base in (("nC12", 0.10), ("nC7", 0.12)):
            ws.append([None, None, fuel, "Yf", "aCFE (1/s)" if cid < 3 else "aHFE (1/s)"])
            for k in range(3):
                ws.append([None, None, None, base + 0.02 * k, 60 + 10 * k])
    ws = wb.create_sheet("data ID 4")
    ws.append([])  # como na fonte: linha 1 vazia, rótulo na 2, cabeçalho na 3
    ws.append([None, None, "Data ID: 4"])
    ws.append([None, None, "a", "ϕ_HFE", "ϕ_CFE"])
    ws.append([None, None, 59, 0.0876, 0.0664])
    ws.append([None, None, 71, 0.0939, 0.0734])
    ws = wb.create_sheet("data ID 5")
    ws.append([])
    ws.append([None, None, "data ID: 5"])
    ws.append([None, "O3 = 0.0 mol.%", "distance [cm]", "PLIF signal [a.u.]", None,
               "O3 = 4.1 mol.%", "distance [cm]", "PLIF signal [a.u.]", None,
               "O3 = 0.0 mol.%", "location [cm]", "temperature [K]", None,
               "O3 = 4.5 mol.%", "location [cm]", "temperature [K]"])  # fmt: skip
    ws.append([None, None, 0, 45.0, None, None, 0, 45.3, None, None, 2.25, 311, None, None, 2.25, 312])
    ws.append([None, None, 0.01, 34.8, None, None, 0.01, 34.1, None, None, 1.9, 331, None, None, 1.9, 335])
    for cid in (6, 7):
        ws = wb.create_sheet(f"data ID {cid}")
        ws.append([])
        ws.append([None, None, f"data ID {cid}"])
        ws.append([None, None, "nC12", "distance[cm]", "chemi. signal [counts]", None,
                   "nC10", "distance[cm]", "chemi. signal [counts]", None,
                   "nC7", "distance[cm]", "chemi. signal [counts]"])  # fmt: skip
        for k in range(4):
            # no conjunto 6, a série nC10 vem com as colunas trocadas, como na fonte real
            nc10 = ((500 + k), 0.5 * k) if cid == 6 else (0.5 * k, 6 + k)
            ws.append([None, None, None, 0.5 * k, 5 + k, None, None, *nc10, None, None, 0.5 * k, 7 + k])
    ws = wb.create_sheet("data ID 8")
    ws.append([None, None, "data ID 8"])
    ws.append([None, None, "550,O3"])
    ws.append([None, None, "Xf", "T_max [K]"])
    ws.append([None, None, 0.1, 814])
    ws.append([None, None, 0.075, 796])
    wb.save(files / "PSI data summary Princeton with links.xlsx")
    (files / "PSI-142_Experimental table_Data Summary Table.csv").write_text(
        "Data ID,Data Description,Reference Publication Link,Figure ID in Reference\n"
        "1,CFE limit with ozone,http://dx.doi.org/a,4\n2,CFE limit without ozone,http://dx.doi.org/a,5\n"
        "3,CFE and HFE Predicted vs Measured ,http://dx.doi.org/a,7\n4,DME CFE and HFE,https://doi.org/b,2\n"
        "5,CH2O PLIF and thermometry,https://doi.org/c,8\n6,nC7/nC10/nC12 chemiluminescence,https://doi.org/d.161,2\n"
        "7,nC12 chemiluminescence,https://doi.org/d.162,7\n8,nC12 thermometry,https://doi.org/d.163,9\n"
    )


@pytest.fixture(autouse=True)
def no_real_ai(monkeypatch):
    """Nenhum teste fala com a Zyria de verdade: o app.py chama load_dotenv(), que recarregaria o .env real
    e faria perguntas cobradas. Os testes do assistente usam um servidor local que imita a Zyria."""
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: False)
    for name in ("ZYRIA_BASE_URL", "ZYRIA_API_KEY", "ZYRIA_MODEL"):
        monkeypatch.delenv(name, raising=False)


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
