"""Aprovação de um envio: o único caminho de um estudo enviado até `dados/` e o banco.

Valida de novo, copia os arquivos para `dados/<PSI>/`, grava `estudo.json` (a especificação aprovada,
com quem propôs e quando) e roda a carga. A partir daí o estudo é um estudo como os outros: entra
na seed e é refeito em toda carga, sem IA.
"""

from __future__ import annotations

import datetime as dt
import json
import shutil
from pathlib import Path

from ..ingest import build, generic, seed
from ..ingest.catalog import INVESTIGACOES
from .staging import Upload, UploadError

SPEC_NAME = "estudo.json"


def approve(
    upload: Upload, spec: dict, *, model: str | None = None, replace: bool = False,
    dados_dir: Path | None = None, db_path: Path | None = None, seed_dir: Path | None = None,
) -> dict[str, int]:  # fmt: skip
    dados_dir, db_path = dados_dir or build.DADOS, db_path or build.DB_PATH
    if problems := generic.validate(spec, upload.files_dir):
        raise UploadError("A especificação ainda tem problemas:\n- " + "\n- ".join(problems))
    psi = spec["investigacao"]["id"]
    if psi in {inv["id"] for inv in INVESTIGACOES}:
        raise UploadError(
            f"{psi} já tem leitor próprio no sistema; envio de estudos é para investigações novas."
        )
    target = dados_dir / psi
    if target.exists():
        if not replace:
            raise UploadError(f"dados/{psi}/ já existe. Marque 'substituir' para trocar a versão anterior.")
        shutil.rmtree(target)
    shutil.copytree(upload.files_dir, target)
    if spec.get("ficha"):  # da ficha, só o que foi marcado na revisão
        from .ficha_docs import accepted

        spec = {**spec, "ficha": accepted(spec["ficha"])}
    approved = {
        **spec,
        "_aprovacao": {
            "aprovado_em": dt.datetime.now().isoformat(timespec="seconds"),
            "envio": upload.id,
            "modelo_que_propos": model,
            "arquivos_originais": [f.origem for f in upload.arquivos],
        },
    }
    (target / SPEC_NAME).write_text(
        json.dumps(approved, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    counts = build.build(dados_dir, db_path)
    if seed_dir is not None or (dados_dir == build.DADOS and db_path == build.DB_PATH):
        seed.export(db_path, seed_dir)
    upload.estado = "aprovado"
    upload.save()
    return counts
