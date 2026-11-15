"""Extração segura de .zip, .tar(.gz/.bz2/.xz) e .rar enviados pelo usuário.

Mesmo vindo de quem usa o painel, um arquivo compactado é dado não confiável. Recusa:
- caminhos que saem da pasta de destino (`../`, absolutos);
- links simbólicos, links físicos e arquivos especiais;
- conteúdo grande demais, arquivos demais ou taxa de compressão de "zip bomb".
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

MAX_TOTAL_BYTES = 300 * 1024 * 1024  # descompactado, somando tudo
MAX_FILES = 2000
MAX_RATIO = 200  # tamanho descompactado / compactado, por arquivo grande
RATIO_MIN_BYTES = 10 * 1024 * 1024
JUNK = {"__MACOSX", ".DS_Store", "Thumbs.db", "desktop.ini"}

ARCHIVE_SUFFIXES = (".zip", ".rar", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz")


class ArchiveError(Exception):
    """Arquivo compactado recusado, com o motivo em português."""


@dataclass
class Member:
    name: str  # caminho relativo, com "/"
    size: int


def is_archive(name: str) -> bool:
    return name.lower().endswith(ARCHIVE_SUFFIXES)


def safe_relative(name: str) -> PurePosixPath | None:
    """Caminho relativo seguro, ou None para entradas a ignorar (pastas, lixo de sistema).
    Levanta ArchiveError se o caminho tentar sair da pasta."""
    clean = name.replace("\\", "/")
    path = PurePosixPath(clean)
    if clean.startswith("/") or (len(clean) > 1 and clean[1] == ":"):
        raise ArchiveError(f"Caminho absoluto dentro do arquivo: {name}")
    if ".." in path.parts:
        raise ArchiveError(f"Caminho que sai da pasta: {name}")
    if not path.parts or clean.endswith("/"):
        return None
    if any(part in JUNK or part.startswith("._") for part in path.parts):
        return None
    return path


def _check_totals(members: list[Member]) -> None:
    if len(members) > MAX_FILES:
        raise ArchiveError(f"Arquivos demais: {len(members)} (limite {MAX_FILES}).")
    total = sum(m.size for m in members)
    if total > MAX_TOTAL_BYTES:
        raise ArchiveError(f"Conteúdo descompactado grande demais: {total / 2**20:.0f} MB "
                           f"(limite {MAX_TOTAL_BYTES / 2**20:.0f} MB).")  # fmt: skip


def _target(dest: Path, rel: PurePosixPath) -> Path:
    target = (dest / Path(*rel.parts)).resolve()
    if not target.is_relative_to(dest.resolve()):
        raise ArchiveError(f"Caminho que sai da pasta: {rel}")
    return target


def _extract_zip(path: Path, dest: Path) -> list[Member]:
    with zipfile.ZipFile(path) as archive:
        chosen = []
        for info in archive.infolist():
            if info.is_dir():
                continue
            mode = info.external_attr >> 16
            if mode and (mode & 0o170000) == 0o120000:  # link simbólico gravado no zip
                raise ArchiveError(f"Link simbólico dentro do arquivo: {info.filename}")
            rel = safe_relative(info.filename)
            if rel is None:
                continue
            if (
                info.file_size > RATIO_MIN_BYTES
                and info.compress_size
                and info.file_size / info.compress_size > MAX_RATIO
            ):
                raise ArchiveError(f"Taxa de compressão suspeita em {info.filename}.")
            chosen.append((info, rel))
        members = [Member(str(rel), info.file_size) for info, rel in chosen]
        _check_totals(members)
        written = 0
        for info, rel in chosen:
            target = _target(dest, rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, target.open("wb") as out:
                while chunk := source.read(1 << 20):  # conta o que realmente sai, não o declarado
                    written += len(chunk)
                    if written > MAX_TOTAL_BYTES:
                        raise ArchiveError("Conteúdo descompactado maior que o declarado no arquivo.")
                    out.write(chunk)
    return members


def _extract_tar(path: Path, dest: Path) -> list[Member]:
    with tarfile.open(path, mode="r:*") as archive:
        chosen = []
        for info in archive.getmembers():
            if info.isdir():
                continue
            if not info.isfile():  # links e arquivos especiais
                raise ArchiveError(f"Entrada que não é arquivo comum: {info.name}")
            rel = safe_relative(info.name)
            if rel is not None:
                chosen.append((info, rel))
        members = [Member(str(rel), info.size) for info, rel in chosen]
        _check_totals(members)
        for info, rel in chosen:
            target = _target(dest, rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(info)
            if source is None:
                continue
            with source, target.open("wb") as out:
                shutil.copyfileobj(source, out)
    return members


def _seven_zip() -> str:
    for tool in ("7z", "7za", "7zz"):
        if found := shutil.which(tool):
            return found
    raise ArchiveError("Para abrir .rar é preciso ter o 7-Zip instalado (comando 7z).")


def _extract_rar(path: Path, dest: Path) -> list[Member]:
    tool = _seven_zip()
    listing = subprocess.run(
        [tool, "l", "-slt", "-ba", str(path)], capture_output=True, text=True, timeout=120
    )
    if listing.returncode != 0:
        raise ArchiveError(f"Não foi possível ler o .rar: {listing.stderr.strip()[:200]}")
    members, entry = [], {}
    for line in [*listing.stdout.splitlines(), ""]:
        if not line.strip():
            is_folder = entry.get("Folder") == "+" or entry.get("Attributes", "").startswith("D")
            if entry.get("Path") and not is_folder:
                if entry.get("Symbolic Link"):
                    raise ArchiveError(f"Link simbólico dentro do arquivo: {entry['Path']}")
                rel = safe_relative(entry["Path"])
                if rel is not None:
                    members.append(Member(str(rel), int(entry.get("Size") or 0)))
            entry = {}
            continue
        key, _, value = line.partition(" = ")
        entry[key.strip()] = value.strip()
    _check_totals(members)
    staging = dest / ".rar_tmp"
    staging.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [tool, "x", "-y", f"-o{staging}", str(path)], capture_output=True, text=True, timeout=600
    )
    if result.returncode != 0:
        shutil.rmtree(staging, ignore_errors=True)
        raise ArchiveError(f"Falha ao extrair o .rar: {result.stderr.strip()[:200]}")
    # move só os membros aprovados; qualquer link ou caminho estranho que o 7z tenha criado é descartado
    for member in members:
        source = staging / member.name
        if source.is_symlink() or not source.is_file():
            continue
        target = _target(dest, PurePosixPath(member.name))
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), target)
    shutil.rmtree(staging, ignore_errors=True)
    return members


def extract(path: Path, dest: Path) -> list[Member]:
    """Extrai `path` em `dest` (que deve estar vazia) e devolve o que foi extraído."""
    dest.mkdir(parents=True, exist_ok=True)
    name = path.name.lower()
    try:
        if name.endswith(".zip"):
            members = _extract_zip(path, dest)
        elif name.endswith(".rar"):
            members = _extract_rar(path, dest)
        elif is_archive(name):
            members = _extract_tar(path, dest)
        else:
            raise ArchiveError(f"Formato não suportado: {path.name}")
    except (zipfile.BadZipFile, tarfile.TarError, OSError, subprocess.TimeoutExpired) as error:
        raise ArchiveError(f"Arquivo compactado inválido ou corrompido ({path.name}): {error}") from error
    for root, _dirs, files in os.walk(dest):  # garantia final: nada de links no resultado
        for file in files:
            if (Path(root) / file).is_symlink():
                (Path(root) / file).unlink()
    return members
