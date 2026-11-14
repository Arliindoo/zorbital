"""Seed: as tabelas já normalizadas, versionadas em `seed/`, para montar o banco sem a pasta `dados/`.

- `uv run spaceapps-build` (com `dados/`) monta o banco e regrava a seed.
- `uv run spaceapps-seed` (sem `dados/`) monta o banco a partir da seed.
- O dashboard faz o segundo passo sozinho, na primeira abertura, se o banco não existir.

Cada tabela vira um Parquet. As visões não entram: são recriadas pelo código (`build.VIEWS`), para nunca
divergirem da versão em uso. A exportação é determinística e só regrava os arquivos cujo conteúdo mudou,
para o git registrar mudança apenas quando os dados mudam.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import duckdb

from .build import DB_PATH, ROOT, VIEWS, _tables_in
from .catalog import GERAL

SEED_DIR = Path(os.environ.get("SPACEAPPS_SEED", ROOT / "seed"))
MANIFEST = "manifest.json"
FORMAT_VERSION = 1


def _dir(seed_dir: Path | None) -> Path:
    return seed_dir or SEED_DIR  # resolvido na chamada, para poder ser redirecionado (testes, SPACEAPPS_SEED)


def exists(seed_dir: Path | None = None) -> bool:
    return (_dir(seed_dir) / MANIFEST).is_file()


def _base_tables(con: duckdb.DuckDBPyConnection) -> list[str]:
    rows = con.sql(
        "SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' ORDER BY 1"
    ).fetchall()
    return [name for (name,) in rows if name != "meta"]


def export(db_path: Path | None = None, seed_dir: Path | None = None) -> list[str]:
    """Grava a seed a partir do banco. Devolve as tabelas cujo arquivo mudou."""
    db_path, seed_dir = db_path or DB_PATH, _dir(seed_dir)
    seed_dir.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(db_path), read_only=True) as con:
        tables = _base_tables(con)
        generated = json.loads(con.sql("SELECT json FROM meta").fetchall()[0][0])["gerado_em"]
        counts = {t: con.sql(f'SELECT count(*) FROM "{t}"').fetchall()[0][0] for t in tables}
        with tempfile.TemporaryDirectory() as tmp:
            changed = []
            for table in tables:
                fresh = Path(tmp) / f"{table}.parquet"
                con.execute(f"COPY \"{table}\" TO '{fresh}' (FORMAT parquet, COMPRESSION zstd)")
                target = seed_dir / fresh.name
                if not target.exists() or target.read_bytes() != fresh.read_bytes():
                    shutil.copyfile(fresh, target)
                    changed.append(table)
    stale = [p for p in seed_dir.glob("*.parquet") if p.stem not in tables]
    for path in stale:  # tabela que deixou de existir no banco
        path.unlink()
        changed.append(path.stem)

    previous = json.loads((seed_dir / MANIFEST).read_text()) if exists(seed_dir) else {}
    manifest = {
        "formato": FORMAT_VERSION,
        # a data só anda quando os dados mudam, para não gerar commit à toa
        "gerado_em": generated if changed or not previous else previous.get("gerado_em", generated),
        "tabelas": counts,
    }
    text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    if previous != manifest:
        (seed_dir / MANIFEST).write_text(text, encoding="utf-8")
    return changed


def load(seed_dir: Path | None = None, db_path: Path | None = None) -> dict[str, int]:
    """Monta o banco a partir da seed, num arquivo novo que só então substitui o anterior."""
    seed_dir, db_path = _dir(seed_dir), db_path or DB_PATH
    manifest = json.loads((seed_dir / MANIFEST).read_text(encoding="utf-8"))
    if manifest.get("formato") != FORMAT_VERSION:
        raise SystemExit(
            f"Seed em formato {manifest.get('formato')}; este código lê o formato {FORMAT_VERSION}."
        )
    db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = db_path.with_suffix(".tmp.duckdb")
    tmp.unlink(missing_ok=True)
    with duckdb.connect(str(tmp)) as con:
        for table, expected in manifest["tabelas"].items():
            path = seed_dir / f"{table}.parquet"
            con.execute(f"CREATE TABLE \"{table}\" AS SELECT * FROM read_parquet('{path}')")
            loaded = con.sql(f'SELECT count(*) FROM "{table}"').fetchall()[0][0]
            if loaded != expected:
                raise SystemExit(f"Seed corrompida: {table} tem {loaded} linhas, o manifesto diz {expected}.")
        created = set(manifest["tabelas"])
        for name, sql in VIEWS.items():
            if all(t in created for t in _tables_in(sql)):
                con.execute(f'CREATE VIEW "{name}" AS {sql}')
                created.add(name)
        meta = {
            "gerado_em": manifest["gerado_em"],
            "carregado_da_seed_em": dt.datetime.now().isoformat(timespec="seconds"),
            "pasta_dados": "seed/",
            "geral": GERAL,
        }
        con.execute(
            "CREATE TABLE meta AS SELECT * FROM (VALUES (?)) t(json)", [json.dumps(meta, ensure_ascii=False)]
        )
    tmp.replace(db_path)
    return manifest["tabelas"]


def main() -> None:
    if not exists():
        sys.exit(f"Seed não encontrada em {SEED_DIR}.")
    counts = load()
    print(f"Banco montado a partir da seed em {DB_PATH}")
    for name, n in counts.items():
        print(f"  {name:28} {n:6} linhas")
