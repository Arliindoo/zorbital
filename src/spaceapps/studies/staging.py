"""Recebimento de um envio: guarda os originais, descompacta e classifica cada arquivo.

Cada envio fica em `data/uploads/<id>/` (fora do git) até ser aprovado:
    originais/   o que foi enviado, intacto
    arquivos/    tudo já descompactado, na estrutura das pastas enviadas
    envio.json   estado do envio (recebido → proposto → aprovado) e a classificação dos arquivos
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import shutil
from dataclasses import asdict, dataclass, field
from pathlib import Path, PurePosixPath

from ..ingest.build import DB_PATH
from . import archive

UPLOADS_DIR = DB_PATH.parent / "uploads"
MAX_NESTING = 2  # compactado dentro de compactado: até dois níveis
PSI_PATTERN = re.compile(r"^PSI-\d{1,4}$")

TABLE_SUFFIXES = {".csv", ".xlsx", ".xlsm"}
UNSUPPORTED_TABLES = {".xls", ".ods", ".tsv"}  # tabelas que ainda não sabemos ler
DOC_SUFFIXES = {".pdf", ".md", ".txt"}


class UploadError(Exception):
    """Envio recusado, com o motivo em português."""


@dataclass
class StoredFile:
    caminho: str  # relativo a arquivos/
    tipo: str  # tabela | documento | tabela_nao_suportada | outro
    tamanho: int
    sha1: str
    origem: str  # nome enviado (ou o compactado de onde saiu)


@dataclass
class Upload:
    id: str
    psi: str
    criado_em: str
    estado: str = "recebido"
    arquivos: list[StoredFile] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    raiz: str = ""  # pasta que contém os envios (padrão: data/uploads)

    @property
    def folder(self) -> Path:
        return Path(self.raiz or UPLOADS_DIR) / self.id

    @property
    def files_dir(self) -> Path:
        return self.folder / "arquivos"

    def of_type(self, kind: str) -> list[StoredFile]:
        return [f for f in self.arquivos if f.tipo == kind]

    def save(self) -> None:
        (self.folder / "envio.json").write_text(
            json.dumps(asdict(self), ensure_ascii=False, indent=2), encoding="utf-8"
        )

    @classmethod
    def load(cls, upload_id: str, root: Path | None = None) -> Upload:
        data = json.loads(((root or UPLOADS_DIR) / upload_id / "envio.json").read_text(encoding="utf-8"))
        data["arquivos"] = [StoredFile(**f) for f in data["arquivos"]]
        return cls(**data)


def kind_of(name: str) -> str:
    lower = name.lower()
    suffix = PurePosixPath(lower).suffix
    if suffix in TABLE_SUFFIXES:
        return "tabela"
    if suffix in DOC_SUFFIXES or PurePosixPath(lower).stem.startswith("readme"):
        return "documento" if suffix in DOC_SUFFIXES else "tabela"  # ReadMe.xlsx é tabela de metadados
    if suffix in UNSUPPORTED_TABLES:
        return "tabela_nao_suportada"
    return "outro"


def normalize_psi(text: str) -> str:
    psi = re.sub(r"\s+", "", text.upper()).replace("PSI", "PSI-").replace("PSI--", "PSI-")
    if not PSI_PATTERN.match(psi):
        raise UploadError(f"Número do PSI inválido: '{text}'. Use o formato PSI-26.")
    return psi


def receive(
    psi: str, files: list[tuple[str, bytes]], uploads_dir: Path | None = None, *, require_table: bool = True
) -> Upload:
    """Guarda os arquivos enviados (nome, conteúdo), descompacta e classifica. Não chama IA.

    `require_table=False` é o envio só de documentos, para a ficha de um estudo que já está no sistema."""
    if not files:
        raise UploadError("Nenhum arquivo enviado.")
    root = uploads_dir or UPLOADS_DIR
    now = dt.datetime.now()
    digest = hashlib.sha1(b"".join(content for _, content in files)).hexdigest()[:8]
    upload = Upload(
        id=f"{now:%Y%m%d-%H%M%S}-{digest}", psi=normalize_psi(psi), criado_em=now.isoformat(timespec="seconds"),
        raiz=str(root),
    )  # fmt: skip
    folder = upload.folder
    originals, target = folder / "originais", folder / "arquivos"
    originals.mkdir(parents=True)
    target.mkdir()
    try:
        for name, content in files:
            base = Path(name).name  # o navegador manda só o nome, mas não confiamos nisso
            if not base or base.startswith("."):
                continue
            (originals / base).write_bytes(content)
            _place(originals / base, target, base, depth=0, upload=upload)
    except archive.ArchiveError as error:
        shutil.rmtree(folder, ignore_errors=True)
        raise UploadError(str(error)) from error

    _check_requirements(upload, require_table)
    upload.save()
    return upload


def _place(path: Path, target: Path, origin: str, depth: int, upload: Upload) -> None:
    """Copia um arquivo para arquivos/ ou, se for compactado, extrai e trata cada item."""
    if archive.is_archive(path.name):
        if depth >= MAX_NESTING:
            upload.avisos.append(
                f"{origin}: compactado dentro de compactado além de {MAX_NESTING} níveis; ignorado."
            )
            return
        folder = target / _strip_archive_suffix(path.name)
        tmp = target.parent / f".extraindo_{depth}_{path.name}"
        archive.extract(path, tmp)
        for item in sorted(p for p in tmp.rglob("*") if p.is_file()):
            rel = item.relative_to(tmp)
            _place(item, folder / rel.parent, f"{origin} › {rel.as_posix()}", depth + 1, upload)
        shutil.rmtree(tmp, ignore_errors=True)
        return
    target.mkdir(parents=True, exist_ok=True)
    final = target / path.name
    if final.exists():  # mesmo nome em lugares diferentes do envio: não sobrescreve
        final = target / f"{final.stem}__{hashlib.sha1(path.read_bytes()).hexdigest()[:6]}{final.suffix}"
    shutil.copyfile(path, final)
    content = final.read_bytes()
    upload.arquivos.append(
        StoredFile(
            caminho=final.relative_to(upload_files_root(final)).as_posix(),
            tipo=kind_of(final.name),
            tamanho=len(content),
            sha1=hashlib.sha1(b"blob %d\0" % len(content) + content).hexdigest(),
            origem=origin,
        )
    )


def upload_files_root(path: Path) -> Path:
    for parent in path.parents:
        if parent.name == "arquivos":
            return parent
    raise UploadError("Estrutura de envio inesperada.")


def _strip_archive_suffix(name: str) -> str:
    lower = name.lower()
    for suffix in sorted(archive.ARCHIVE_SUFFIXES, key=len, reverse=True):
        if lower.endswith(suffix):
            return name[: -len(suffix)] or "compactado"
    return name


def _check_requirements(upload: Upload, require_table: bool = True) -> None:
    tables, docs = upload.of_type("tabela"), upload.of_type("documento")
    unsupported = upload.of_type("tabela_nao_suportada")
    if unsupported:
        upload.avisos.append(
            "Tabelas em formato ainda não suportado (converta para .xlsx ou .csv): "
            + ", ".join(f.caminho for f in unsupported)
        )
    problems = []
    if not tables and require_table:
        problems.append("nenhuma tabela (.csv, .xlsx)")
    if not docs:
        problems.append("nenhum documento (.pdf, .md ou .txt): o documento é obrigatório")
    if problems:
        shutil.rmtree(upload.folder, ignore_errors=True)
        raise UploadError("Envio incompleto: " + "; ".join(problems) + ".")
