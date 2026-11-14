"""Monta o banco a partir de `dados/`: `uv run spaceapps-build`.

1. Inventaria todos os arquivos, com hash, e marca duplicatas exatas.
2. Para cada investigação, carrega a melhor fonte disponível (original completo > amostra).
3. Grava tabelas, alertas de qualidade e o registro de fontes num arquivo DuckDB novo e só
   então substitui o anterior, para o dashboard nunca ler um banco pela metade.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import sys
from pathlib import Path

import duckdb
import polars as pl

from . import bass, flex, psi117
from .catalog import DOC_SUFFIXES, GERAL, INVESTIGACOES, KNOWN_FILES

ROOT = Path(__file__).resolve().parents[3]
DADOS = Path(os.environ.get("SPACEAPPS_DADOS", ROOT / "dados"))
DB_PATH = Path(os.environ.get("SPACEAPPS_DB", ROOT / "data" / "zorbital.duckdb"))
LOADERS = {"flex": flex.load, "bass": bass.load, "psi117": psi117.load}
TABLES = {"flex": "flex_ensaios", "bass": "bass_ensaios", "psi117": "psi117_extincao"}

VIEWS = {
    # Medição e modelo lado a lado por pressão. Medições repetidas na mesma pressão viram média,
    # com a contagem ao lado para ninguém tomar a média por um ponto só.
    # "modelo_na_faixa" compara o modelo com a faixa de incerteza informada; fica vazio onde não há faixa.
    "v_psi117_comparacao": """
        SELECT *, round(modelo_mm - medido_mm, 3) AS diferenca_mm,
               CASE WHEN limite_inferior_mm IS NOT NULL
                    THEN modelo_mm BETWEEN limite_inferior_mm AND limite_superior_mm END AS modelo_na_faixa
        FROM (
            SELECT tipo_chama, pressao_atm,
                   avg(diametro_extincao_mm) FILTER (serie = 'Medição') AS medido_mm,
                   count(*) FILTER (serie = 'Medição') AS n_medicoes,
                   avg(diametro_extincao_mm) FILTER (serie = 'Modelo') AS modelo_mm,
                   max(diametro_extincao_mm) FILTER (serie = 'Limite inferior') AS limite_inferior_mm,
                   max(diametro_extincao_mm) FILTER (serie = 'Limite superior') AS limite_superior_mm
            FROM psi117_extincao GROUP BY ALL
        ) ORDER BY tipo_chama, pressao_atm""",
    "v_bass_por_material": """
        SELECT material_categoria, geometria, count(*) AS testes,
               count(DISTINCT pesquisador) AS pesquisadores,
               min(o2_inicial_pct) AS o2_inicial_min, max(o2_inicial_pct) AS o2_inicial_max,
               round(avg(delta_co2_pp), 3) AS delta_co2_medio_pp
        FROM bass_ensaios GROUP BY ALL ORDER BY testes DESC""",
    "v_flex_por_desfecho": """
        SELECT desfecho, combustivel, count(*) AS ensaios,
               round(avg(oxigenio_fracao), 3) AS o2_medio, round(avg(pressao_mmhg), 1) AS pressao_media_mmhg,
               round(avg(diametro_inicial_mm), 2) AS diametro_inicial_medio_mm
        FROM flex_ensaios GROUP BY ALL ORDER BY ensaios DESC""",
    "v_alertas_resumo": """
        SELECT investigacao, tipo, count(*) AS ocorrencias
        FROM alertas GROUP BY ALL ORDER BY investigacao, tipo""",
}


def inventory(dados: Path) -> list[dict]:
    files, seen = [], {}
    for path in sorted(p for p in dados.rglob("*") if p.is_file() and not p.name.startswith(".")):
        content = path.read_bytes()
        md5 = hashlib.md5(content).hexdigest()  # noqa: S324 — identificação de duplicata, não segurança
        known = KNOWN_FILES.get(path.name)
        entry = {
            "caminho": str(path.relative_to(dados)),
            "nome": path.name,
            "investigacao": known.investigacao if known else None,
            "papel": known.papel
            if known
            else ("Documentação" if path.suffix.lower() in DOC_SUFFIXES else "Desconhecido"),
            "tamanho_bytes": len(content),
            "md5": md5,
            "git_blob_sha1": hashlib.sha1(b"blob %d\0" % len(content) + content).hexdigest(),
            "modificado_em": dt.datetime.fromtimestamp(path.stat().st_mtime),
            "duplicata_de": seen.get(md5),
            "status": None,
            "motivo": None,
            "linhas_carregadas": None,
            "_path": path,
            "_known": known,
        }
        seen.setdefault(md5, entry["caminho"])
        files.append(entry)
    return files


def choose_sources(files: list[dict]) -> dict[str, dict]:
    """Escolhe, por leitor, o arquivo de menor prioridade que não seja duplicata."""
    chosen: dict[str, dict] = {}
    for f in files:
        known = f["_known"]
        if f["duplicata_de"] or not known or not known.leitor:
            continue
        current = chosen.get(known.leitor)
        if current is None or known.prioridade < current["_known"].prioridade:
            chosen[known.leitor] = f
    return chosen


def build(dados: Path = DADOS, db_path: Path = DB_PATH) -> dict[str, int]:
    if not dados.is_dir():
        raise SystemExit(f"Pasta de dados não encontrada: {dados}")
    files = inventory(dados)
    chosen = choose_sources(files)

    tables, alerts = {}, []
    for leitor, f in chosen.items():
        table, found = LOADERS[leitor](f["_path"])
        tables[TABLES[leitor]] = table.with_columns(fonte_arquivo=pl.lit(f["caminho"]))
        alerts.append(found)
        f.update(status="Carregado", linhas_carregadas=table.height)

    loaded_by_inv = {f["investigacao"]: f["caminho"] for f in chosen.values()}
    for f in files:
        if f["status"]:
            continue
        if f["duplicata_de"]:
            f.update(status="Duplicata exata", motivo=f"Mesmo conteúdo de {f['duplicata_de']}.")
        elif f["papel"] == "Documentação":
            f.update(status="Documentação", motivo="Usado como referência, não como dado.")
        elif "derivada" in f["papel"]:
            f.update(status="Não carregado", motivo="Derivado de outra fonte; não é fonte primária.")
        elif f["investigacao"] in loaded_by_inv:
            f.update(status="Não carregado", motivo=f"Coberto por {loaded_by_inv[f['investigacao']]}.")
        elif f["_known"]:
            f.update(status="Não carregado", motivo="Ainda não há leitor para este formato.")
        else:
            f.update(status="Não reconhecido", motivo="Arquivo novo: adicionar em ingest/catalog.py.")

    sources = pl.DataFrame(
        [{k: v for k, v in f.items() if not k.startswith("_")} for f in files], infer_schema_length=None
    )
    investigations = pl.DataFrame(INVESTIGACOES).with_columns(
        fonte_carregada=pl.col("id").replace_strict(loaded_by_inv, default=None)
    )
    meta = {
        "gerado_em": dt.datetime.now().isoformat(timespec="seconds"),
        "pasta_dados": str(dados),
        "geral": GERAL,
    }

    db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = db_path.with_suffix(".tmp.duckdb")
    tmp.unlink(missing_ok=True)
    with duckdb.connect(str(tmp)) as con:
        frames = {**tables, "alertas": pl.concat(alerts), "fontes": sources, "investigacoes": investigations}
        for name, frame in frames.items():
            con.register("_frame", frame.to_arrow())
            con.execute(f'CREATE TABLE "{name}" AS SELECT * FROM _frame')
            con.unregister("_frame")
        for name, sql in VIEWS.items():
            if all(t in frames for t in _tables_in(sql)):
                con.execute(f'CREATE VIEW "{name}" AS {sql}')
        con.execute(
            "CREATE TABLE meta AS SELECT * FROM (VALUES (?)) t(json)", [json.dumps(meta, ensure_ascii=False)]
        )
    tmp.replace(db_path)
    return {name: frame.height for name, frame in frames.items()}


def _tables_in(sql: str) -> list[str]:
    return [t for t in (*TABLES.values(), "alertas") if f"FROM {t}" in sql]


def main() -> None:
    counts = build()
    print(f"Banco gravado em {DB_PATH}")
    for name, n in counts.items():
        print(f"  {name:18} {n:5} linhas")
    con = duckdb.connect(str(DB_PATH), read_only=True)
    for row in con.execute("SELECT status, count(*) FROM fontes GROUP BY 1 ORDER BY 2 DESC").fetchall():
        print(f"  arquivos {row[0].lower():16} {row[1]:3}")
    con.close()


if __name__ == "__main__":
    sys.exit(main())
