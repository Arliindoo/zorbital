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

from . import bass, cfi, flex, links, psi117, psi117_more, psi142
from .catalog import DOC_SUFFIXES, GERAL, INVESTIGACOES, KNOWN_FILES, canonical_name

ROOT = Path(__file__).resolve().parents[3]
DADOS = Path(os.environ.get("SPACEAPPS_DADOS", ROOT / "dados"))
DB_PATH = Path(os.environ.get("SPACEAPPS_DB", ROOT / "data" / "zorbital.duckdb"))


def _single(name, loader):
    def run(path, companion):
        table, alerts = loader(path)
        return {name: table}, alerts

    return run


def _cfi(path, companion):
    tests, cameras, alerts = cfi.load(path)
    return {"cfi_ensaios": tests, "cfi_cameras": cameras}, alerts


def _psi142(path, companion):
    sets, points, alerts = psi142.load(path, companion)
    return {"psi142_conjuntos": sets, "psi142_pontos": points}, alerts


# leitor → função(arquivo, arquivo complementar ou None) → ({tabela: linhas}, alertas)
LOADERS = {
    "flex": _single("flex_ensaios", flex.load),
    "bass": _single("bass_ensaios", bass.load),
    "psi117": _single("psi117_extincao", psi117.load),
    "psi117_readme": _single("psi117_tabelas", psi117_more.load_readme),
    "psi117_1atm": _single("psi117_extincao_1atm", psi117_more.load_1atm),
    # as duas séries temporais vão para a mesma tabela, separadas pela coluna `cenario`
    "psi117_serie_estavel": _single("psi117_series_modelo", psi117_more.load_series),
    "psi117_serie_oscilatoria": _single("psi117_series_modelo", psi117_more.load_series),
    "cfi": _cfi,
    "psi142": _psi142,
}

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
    # CFI por condição. "sem_extincao_fria_visivel" conta os zeros da fonte (gota consumida).
    "v_cfi_por_pressao": """
        SELECT combustivel, diluente, pressao_atm, count(*) AS ensaios,
               count(d0_mm) AS com_d0, round(median(d0_mm), 3) AS d0_mediana_mm,
               count(dext_quente_mm) AS com_dext_quente, round(median(dext_quente_mm), 3) AS dext_quente_mediana_mm,
               count(dext_fria_mm) AS com_dext_fria, round(median(dext_fria_mm), 3) AS dext_fria_mediana_mm,
               count(*) FILTER (dext_fria_zero_na_fonte) AS sem_extincao_fria_visivel,
               count(*) FILTER (NOT analise_completa) AS analise_incompleta
        FROM cfi_ensaios GROUP BY ALL ORDER BY combustivel, diluente, pressao_atm""",
    # A única comparação entre investigações: diâmetro de extinção de gotas de n-dodecano puro por
    # pressão. PSI-117 (medição e modelo, solo) ao lado dos ensaios de voo do CFI sem hélio.
    "v_extincao_c12_comparacao": """
        WITH cfi AS (
            SELECT 'Chama quente' AS tipo_chama, pressao_atm, dext_quente_mm AS d, false AS sem_extincao
            FROM cfi_ensaios WHERE combustivel = 'n-dodecano' AND diluente = 'Nitrogênio'
            UNION ALL
            SELECT 'Chama fria', pressao_atm, dext_fria_mm, dext_fria_zero_na_fonte
            FROM cfi_ensaios WHERE combustivel = 'n-dodecano' AND diluente = 'Nitrogênio'
        ), agregado AS (
            SELECT tipo_chama, pressao_atm, count(*) AS cfi_ensaios, count(d) AS cfi_com_valor,
                   round(median(d), 3) AS cfi_mediana_mm, min(d) AS cfi_min_mm, max(d) AS cfi_max_mm,
                   count(*) FILTER (sem_extincao) AS cfi_sem_extincao_visivel
            FROM cfi GROUP BY ALL
        )
        SELECT tipo_chama, pressao_atm, p.medido_mm AS psi117_medido_mm, p.n_medicoes AS psi117_n_medicoes,
               p.modelo_mm AS psi117_modelo_mm, p.limite_inferior_mm AS psi117_faixa_min_mm,
               p.limite_superior_mm AS psi117_faixa_max_mm, a.cfi_ensaios, a.cfi_com_valor, a.cfi_mediana_mm,
               a.cfi_min_mm, a.cfi_max_mm, a.cfi_sem_extincao_visivel,
               CASE WHEN p.limite_inferior_mm IS NOT NULL AND a.cfi_mediana_mm IS NOT NULL
                    THEN a.cfi_mediana_mm BETWEEN p.limite_inferior_mm AND p.limite_superior_mm
               END AS cfi_mediana_na_faixa_psi117
        FROM v_psi117_comparacao p FULL JOIN agregado a USING (tipo_chama, pressao_atm)
        ORDER BY tipo_chama, pressao_atm""",
}


def inventory(dados: Path) -> list[dict]:
    files, seen = [], {}
    for path in sorted(p for p in dados.rglob("*") if p.is_file() and not p.name.startswith(".")):
        content = path.read_bytes()
        md5 = hashlib.md5(content).hexdigest()  # noqa: S324 — identificação de duplicata, não segurança
        known = KNOWN_FILES.get(canonical_name(path.name))
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

    tables, alerts, table_source = {}, [], {}
    for leitor, f in chosen.items():
        companion = next(
            (c for c in files if c["_known"] and c["_known"].complementa == leitor and not c["duplicata_de"]),
            None,
        )
        try:
            loaded, found = LOADERS[leitor](f["_path"], companion["_path"] if companion else None)
        except ValueError as error:  # formato diferente do esperado: registra e segue com o resto
            f.update(status="Não carregado", motivo=f"Formato não reconhecido pelo leitor: {error}")
            continue
        for name, table in loaded.items():
            table = table.with_columns(fonte_arquivo=pl.lit(f["caminho"]))
            tables[name] = pl.concat([tables[name], table], how="diagonal") if name in tables else table
            table_source.setdefault(name, f["caminho"])
        alerts.append(found)
        f.update(status="Carregado", linhas_carregadas=sum(t.height for t in loaded.values()))
        if companion:
            companion.update(status="Carregado", motivo=f"Metadados cruzados com {f['caminho']}.")

    correspondence, found = links.psi117_cfi(tables)
    if correspondence is not None:
        tables["psi117_cfi_correspondencia"] = correspondence
        alerts.append(found)
    present = {canonical_name(f["nome"]).rsplit(".", 1)[0] for f in files}
    if "psi117_tabelas" in tables:  # o ReadMe diz que tabelas existem; marca quais estão em dados/
        tables["psi117_tabelas"] = tables["psi117_tabelas"].with_columns(
            presente_em_dados=pl.col("arquivo").is_in(list(present))
        )

    loaded = {leitor: f["caminho"] for leitor, f in chosen.items() if f["status"] == "Carregado"}
    for f in files:
        if f["status"]:
            continue
        known = f["_known"]
        covering = loaded.get(known.leitor or known.coberto_por) if known else None
        if f["duplicata_de"]:
            f.update(status="Duplicata exata", motivo=f"Mesmo conteúdo de {f['duplicata_de']}.")
        elif f["papel"] == "Documentação":
            f.update(status="Documentação", motivo="Usado como referência, não como dado.")
        elif "derivada" in f["papel"]:
            f.update(status="Não carregado", motivo="Derivado de outra fonte; não é fonte primária.")
        elif covering:
            f.update(status="Não carregado", motivo=f"Coberto por {covering}.")
        elif known:
            f.update(status="Não carregado", motivo="Ainda não há leitor para este formato.")
        else:
            f.update(status="Não reconhecido", motivo="Arquivo novo: adicionar em ingest/catalog.py.")

    sources = pl.DataFrame(
        [{k: v for k, v in f.items() if not k.startswith("_")} for f in files], infer_schema_length=None
    )
    # fonte da tabela principal de cada investigação, e todas as que entraram para ela
    main = {inv["id"]: table_source.get(inv["tabela"]) for inv in INVESTIGACOES}
    every = {inv["id"]: "; ".join(f["caminho"] for f in files if f["status"] == "Carregado"
                                  and f["investigacao"] == inv["id"]) or None for inv in INVESTIGACOES}  # fmt: skip
    investigations = pl.DataFrame(INVESTIGACOES).with_columns(
        fonte_carregada=pl.col("id").replace_strict(main, default=None),
        fontes_carregadas=pl.col("id").replace_strict(every, default=None),
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
        created = set(frames)
        for name, sql in VIEWS.items():  # em ordem: uma visão pode usar outra criada antes
            if all(t in created for t in _tables_in(sql)):
                con.execute(f'CREATE VIEW "{name}" AS {sql}')
                created.add(name)
        con.execute(
            "CREATE TABLE meta AS SELECT * FROM (VALUES (?)) t(json)", [json.dumps(meta, ensure_ascii=False)]
        )
    tmp.replace(db_path)
    return {name: frame.height for name, frame in frames.items()}


def _tables_in(sql: str) -> list[str]:
    """Tabelas e visões citadas depois de FROM/JOIN, para pular visões cujos dados não existem."""
    import re

    names = set(re.findall(r"\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)", sql))
    return sorted(names - {"cfi", "agregado"})  # nomes de CTE


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
