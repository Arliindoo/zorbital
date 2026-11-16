"""Deterministic review checks and table previews, independent of HTTP."""

from ..ingest import generic
from . import ficha_docs, staging

PREVIEW_ROWS = 50
BLOCKS_PREVIEW = ("não encontrad", "não existe", "linha_cabecalho")


def check_spec(upload: staging.Upload, spec: dict) -> dict:
    """Os problemas que impedem aprovar e, se der para ler, a prévia das tabelas e dos alertas."""
    try:
        problems = generic.validate(spec, upload.files_dir)
    except (KeyError, TypeError, AttributeError) as error:
        return {
            "problemas": [f"Especificação malformada ({error})."],
            "previa": None,
            "previa_erro": str(error),
        }
    preview, failure = None, None
    try:
        if any(mark in p for p in problems for mark in BLOCKS_PREVIEW):
            raise generic.SpecError("corrija primeiro os pontos de arquivo, aba ou cabeçalho acima.")
        tables, alerts, _ = generic.apply(spec, upload.files_dir)
    except (generic.SpecError, KeyError, ValueError, TypeError, OSError) as error:
        failure = str(error)
    else:
        preview = {
            "tabelas": [
                {"nome": name, "linhas": frame.height, "dados": frame.head(PREVIEW_ROWS)}
                for name, frame in tables.items()
            ],
            "alertas": alerts.drop("investigacao", strict=False) if alerts.height else None,
        }
    return {"problemas": problems, "previa": preview, "previa_erro": failure}


def check_sheet(sheet: dict) -> dict:
    kept = len(ficha_docs.items(ficha_docs.accepted(sheet)))
    problems = ficha_docs.validate(sheet)
    if not kept:
        problems = ["A ficha está vazia: não há o que gravar.", *problems]
    return {"problemas": problems, "itens": kept, "desmarcados": ficha_docs.pending(sheet)}
