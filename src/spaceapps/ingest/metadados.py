"""Metadados do portal NASA PSI (formato ISA-Tab), baixados em lote como um .tar.gz de zips.

Cada zip traz um `i_Investigation.txt`: objetivo, hipótese, abordagem, equipamento, período e a lista de
publicações. É texto com campos fixos, então o código lê direto, sem IA. Os campos de pessoas (nome, e-mail,
telefone, endereço) ficam de fora de propósito: não são necessários para interpretar os dados.

O arquivo é lido na memória, sem extrair nada para o disco, e com limites de tamanho.
"""

from __future__ import annotations

import csv
import io
import re
import tarfile
import zipfile
from pathlib import Path

import polars as pl

from ..datasets.common import Alerts

MAX_ZIP = 5 * 1024 * 1024  # um zip de metadados tem ~10–25 KB
MAX_TEXT = 2 * 1024 * 1024
ISA_FILE = "i_Investigation.txt"

# campo do ISA → nome no banco (só o que interessa à ficha; pessoas e contatos não entram)
CAMPOS = {
    "Study Title": "titulo",
    "Comment[Investigation Acronym]": "sigla",
    "Comment[Objective]": "objetivo",
    "Comment[Hypothesis]": "hipotese",
    "Comment[Approach]": "abordagem",
    "Comment[Experiment Hardware]": "equipamento",
    "Comment[Experiment Hardware Link]": "equipamento_links",
    "Comment[Flight Platform]": "plataforma",
    "Comment[Project Type]": "tipo_projeto",
    "Comment[Research Area]": "area",
    "Comment[SubResearch Area]": "subarea",
    "Comment[Managing NASA Center]": "centro_nasa",
    "Comment[Investigation Start Date]": "inicio",
    "Comment[Investigation End Date]": "fim",
    "Comment[Mission Name]": "missao",
    "Comment[DOI]": "doi",
    "Study Design Type": "palavras_chave",
}
PUBLICACOES = {
    "Study Publication Title": "titulo",
    "Study Publication Author List": "autores",
    "Study Publication DOI": "doi",
    "Comment[Study Publication Link]": "link",
    "Study Publication Status": "situacao",
}


def parse(text: str) -> dict[str, list[str]]:
    """Campo → valores (as colunas depois do nome). Textos entre aspas podem ter quebras de linha."""
    rows = csv.reader(io.StringIO(text), delimiter="\t", quotechar='"')
    return {row[0].strip(): [v.strip() for v in row[1:]] for row in rows if row and row[0].strip()}


def _first(values: list[str] | None) -> str | None:
    found = [v for v in values or [] if v]
    return found[0] if found else None


def _clean(text: str | None) -> str | None:
    if text is None:
        return None
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line) or None


def read_entries(path: Path) -> list[tuple[str, str]]:
    """(nome do zip, texto do i_Investigation.txt) de cada zip dentro do .tar.gz."""
    out = []
    with tarfile.open(path, mode="r:*") as archive:
        for member in archive.getmembers():
            if not (member.isfile() and member.name.lower().endswith(".zip")) or member.size > MAX_ZIP:
                continue
            handle = archive.extractfile(member)
            if handle is None:
                continue
            with zipfile.ZipFile(io.BytesIO(handle.read())) as inner:
                info = next((i for i in inner.infolist() if Path(i.filename).name == ISA_FILE), None)
                if info is None or info.file_size > MAX_TEXT:
                    continue
                out.append((Path(member.name).name, inner.read(info).decode("utf-8", "replace")))
    return out


def load(path: Path) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Uma linha por investigação, uma por publicação, e os alertas (zips sem identificador)."""
    alerts = Alerts(None)  # o arquivo cobre várias investigações
    rows, publications = [], []
    for zip_name, text in read_entries(path):
        fields = parse(text)
        psi = _first(fields.get("Study Identifier")) or (re.match(r"PSI-\d+", zip_name) or [None])[0]
        if not psi or not re.fullmatch(r"PSI-\d+", psi):
            alerts.add(
                None,
                "arquivo",
                zip_name,
                "metadado_sem_id",
                "Zip de metadados sem identificador PSI; ignorado.",
            )
            continue
        row = {"investigacao": psi, "arquivo_metadados": zip_name}
        for key, name in CAMPOS.items():
            values = [v for v in fields.get(key, []) if v]
            row[name] = " | ".join(values) if name == "palavras_chave" else _clean(_first(values))
        rows.append(row)
        columns = {name: fields.get(key, []) for key, name in PUBLICACOES.items()}
        for i, title in enumerate(columns["titulo"]):
            if title:
                publications.append({"investigacao": psi, "ordem": i + 1, **{
                    name: (values[i] or None) if i < len(values) else None for name, values in columns.items()
                }})  # fmt: skip
    schema = {
        "investigacao": pl.String,
        "arquivo_metadados": pl.String,
        **dict.fromkeys(CAMPOS.values(), pl.String),
    }
    pub_schema = {
        "investigacao": pl.String,
        "ordem": pl.Int64,
        **dict.fromkeys(PUBLICACOES.values(), pl.String),
    }
    return (
        pl.DataFrame(rows, schema=schema).unique("investigacao", keep="first", maintain_order=True),
        pl.DataFrame(publications, schema=pub_schema),
        alerts.frame(),
    )
