"""Texto dos documentos de um envio (PDF, MD, TXT), página a página, para a IA citar a página."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_CHARS_TOTAL = 120_000  # ~30 mil tokens: o que vai para a IA de todos os documentos juntos
MAX_PAGES_PER_PDF = 80


@dataclass
class Document:
    arquivo: str
    paginas: list[tuple[int, str]] = field(default_factory=list)  # (nº da página, texto)
    total_paginas: int = 0
    aviso: str | None = None

    @property
    def chars(self) -> int:
        return sum(len(t) for _, t in self.paginas)


def read_document(path: Path, rel: str) -> Document:
    doc = Document(arquivo=rel)
    if path.suffix.lower() in (".md", ".txt"):
        text = path.read_text(encoding="utf-8", errors="replace")
        doc.paginas, doc.total_paginas = [(1, text)], 1
        return doc
    try:
        reader = PdfReader(path)
        doc.total_paginas = len(reader.pages)
        for number, page in enumerate(reader.pages[:MAX_PAGES_PER_PDF], start=1):
            text = " ".join((page.extract_text() or "").split())
            if text:
                doc.paginas.append((number, text))
    except (PdfReadError, OSError, ValueError) as error:
        doc.aviso = f"Não foi possível ler o PDF: {error}"
        return doc
    if doc.total_paginas > MAX_PAGES_PER_PDF:
        doc.aviso = f"Só as primeiras {MAX_PAGES_PER_PDF} de {doc.total_paginas} páginas foram lidas."
    if doc.total_paginas and not doc.paginas:
        doc.aviso = "PDF sem texto extraível (provavelmente escaneado): a IA não consegue lê-lo."
    return doc


def read_documents(files_dir: Path, docs: list[str]) -> list[Document]:
    return [read_document(files_dir / rel, rel) for rel in docs]


def as_prompt(documents: list[Document]) -> tuple[str, bool]:
    """Texto dos documentos com marcação de página, até o limite total. Devolve também se cortou."""
    parts, used, cut = [], 0, False
    for doc in documents:
        parts.append(
            f"=== DOCUMENTO {doc.arquivo} ({doc.total_paginas} páginas)"
            + (f" — {doc.aviso}" if doc.aviso else "")
        )
        for number, text in doc.paginas:
            room = MAX_CHARS_TOTAL - used
            if room <= 0:
                cut = True
                break
            piece = text[:room]
            cut = cut or len(piece) < len(text)
            parts.append(f"--- página {number} ---\n{piece}")
            used += len(piece)
    if cut:
        parts.append(f"[documentos cortados em {MAX_CHARS_TOTAL} caracteres]")
    return "\n".join(parts), cut
