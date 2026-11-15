"""Leitor genérico: aplica a especificação de leitura (`estudo.json`) de um estudo enviado.

A especificação é proposta pela IA e aprovada por uma pessoa; daqui em diante é só código: a mesma
especificação sobre os mesmos arquivos dá sempre o mesmo resultado, e a carga nunca chama a IA.

Layouts desta versão:
- `simples`: uma fonte (arquivo ou aba), cabeçalho numa linha, um registro por linha;
- `empilhado`: várias fontes com as mesmas colunas (ex.: uma aba por pesquisador), uma embaixo da outra,
  com a origem de cada linha numa coluna.
Outros layouts (blocos lado a lado, abas ligadas por chave) continuam pedindo leitor manual.
"""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl

from ..studies.profile import read_rows, sheet_names
from .common import Alerts, is_blank, to_date, to_number, to_text
from .ficha import ATRIBUTOS, GRANDEZAS

LAYOUTS = ("simples", "empilhado")
NATUREZAS = ("IDENTIFICADOR", "CONDICAO", "MEDIDO", "SIMULADO", "INCERTEZA", "DERIVADO", "TEXTO", "IGNORAR")
TIPOS = ("numero", "texto", "categoria", "data", "booleano")
EVIDENCIAS = ("documento", "cabecalho", "inferido")
NAME = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
TRUE = {"yes", "y", "sim", "s", "true", "1", "x"}
FALSE = {"no", "n", "nao", "não", "false", "0"}


class SpecError(ValueError):
    """Especificação que não pode ser aplicada aos arquivos."""


def norm(text: object) -> str:
    """Cabeçalho comparável: espaços normalizados, sem diferenciar maiúsculas."""
    return " ".join(str(text or "").split()).casefold()


def table_name(psi: str, name: str) -> str:
    return f"{psi.lower().replace('-', '')}_{name}"


def validate(spec: dict, files_dir: Path) -> list[str]:
    """Problemas que impedem aprovar a especificação. Lista vazia = pode aprovar."""
    problems: list[str] = []
    inv = spec.get("investigacao") or {}
    for key in ("id", "nome", "categoria", "ambiente", "tipo_evidencia", "pergunta"):
        if not str(inv.get(key) or "").strip():
            problems.append(f"Investigação: falta '{key}'.")
    if not inv.get("cautelas"):
        problems.append("Investigação: liste ao menos uma cautela (o que não concluir destes dados).")
    tables = spec.get("tabelas") or []
    if not tables:
        problems.append("Nenhuma tabela na especificação.")
    seen_tables = set()
    for t in tables:
        label = f"Tabela '{t.get('nome')}'"
        if not NAME.match(str(t.get("nome") or "")):
            problems.append(f"{label}: nome deve ser minúsculo, sem acento, com _ (ex.: ensaios).")
        if t.get("nome") in seen_tables:
            problems.append(f"{label}: nome repetido.")
        seen_tables.add(t.get("nome"))
        if t.get("layout") not in LAYOUTS:
            problems.append(f"{label}: layout '{t.get('layout')}' não suportado (use {', '.join(LAYOUTS)}).")
        sources = t.get("fontes") or []
        if not sources:
            problems.append(f"{label}: nenhuma fonte.")
        if t.get("layout") == "simples" and len(sources) > 1:
            problems.append(f"{label}: layout simples aceita uma fonte só; use 'empilhado'.")
        columns = t.get("colunas") or []
        destinations = [c.get("destino") for c in columns if c.get("natureza") != "IGNORAR"]
        for c in columns:
            where = f"{label}, coluna '{c.get('origem')}'"
            if c.get("natureza") not in NATUREZAS:
                problems.append(f"{where}: natureza '{c.get('natureza')}' inválida.")
            if c.get("natureza") == "IGNORAR":
                continue
            if not NAME.match(str(c.get("destino") or "")):
                problems.append(f"{where}: destino '{c.get('destino')}' deve ser minúsculo com _.")
            if c.get("tipo") not in TIPOS:
                problems.append(f"{where}: tipo '{c.get('tipo')}' inválido.")
            if c.get("grandeza") and c["grandeza"] not in GRANDEZAS:
                problems.append(
                    f"{where}: grandeza '{c['grandeza']}' fora do vocabulário ({', '.join(GRANDEZAS)})."
                )
            if c.get("atributo") and c["atributo"] not in ATRIBUTOS:
                problems.append(
                    f"{where}: atributo '{c['atributo']}' fora do vocabulário ({', '.join(ATRIBUTOS)})."
                )
            if (
                c.get("natureza") in ("MEDIDO", "SIMULADO", "INCERTEZA", "CONDICAO", "DERIVADO")
                and c.get("tipo") == "numero"
            ):
                if not str(c.get("unidade") or "").strip():
                    problems.append(
                        f"{where}: grandeza numérica sem unidade (use 'adimensional' ou 'não informada')."
                    )
            evidence = c.get("evidencia") or {}
            if evidence.get("tipo") not in EVIDENCIAS:
                problems.append(f"{where}: evidência deve ser {', '.join(EVIDENCIAS)}.")
            elif evidence.get("tipo") == "inferido" and not c.get("confirmado"):
                problems.append(f"{where}: interpretação inferida pela IA, ainda não confirmada na revisão.")
        duplicated = {d for d in destinations if destinations.count(d) > 1}
        if duplicated:
            problems.append(f"{label}: destinos repetidos {sorted(duplicated)}.")
        if t.get("layout") == "empilhado" and not NAME.match(str(t.get("coluna_fonte") or "")):
            problems.append(
                f"{label}: layout empilhado precisa de 'coluna_fonte' (nome da coluna com a origem)."
            )
        if not any(c.get("natureza") in ("MEDIDO", "SIMULADO", "CONDICAO", "IDENTIFICADOR") for c in columns):
            problems.append(f"{label}: nenhuma coluna de dado (identificador, condição ou medida).")
        for s in sources:
            problems += _check_source(t, s, files_dir)
    from ..studies import ficha_docs  # aqui dentro: o módulo usa o banco, que importa a carga

    return problems + ficha_docs.validate(spec.get("ficha"))


def _check_source(table: dict, source: dict, files_dir: Path) -> list[str]:
    label = f"Tabela '{table.get('nome')}', fonte {source.get('arquivo')}" + (
        f" aba '{source['aba']}'" if source.get("aba") else ""
    )
    path = files_dir / str(source.get("arquivo") or "")
    if not path.is_file():
        return [f"{label}: arquivo não encontrado no envio."]
    if source.get("aba") and source["aba"] not in sheet_names(path):
        return [f"{label}: aba não existe."]
    header_line = source.get("linha_cabecalho")
    if not isinstance(header_line, int) or header_line < 1:
        return [f"{label}: linha_cabecalho deve ser um inteiro ≥ 1."]
    rows = read_rows(path, source.get("aba"))
    if header_line > len(rows):
        return [f"{label}: linha_cabecalho {header_line} além do fim da tabela."]
    header = {norm(h) for h in rows[header_line - 1] if not is_blank(h)}
    mapped = {norm(c.get("origem")) for c in table.get("colunas") or []}
    problems = [f"{label}: coluna '{c.get('origem')}' não está no cabeçalho da linha {header_line}."
                for c in table.get("colunas") or [] if norm(c.get("origem")) not in header]  # fmt: skip
    unmapped = sorted(h for h in header - mapped)
    if unmapped:
        problems.append(f"{label}: colunas do arquivo sem destino (mapeie ou marque IGNORAR): {unmapped}.")
    return problems


def _convert(alerts: Alerts, row_id: str, column: dict, value: object) -> object:
    for special in column.get("valores_especiais") or []:
        if norm(value) == norm(special.get("valor")):
            if special.get("acao", "vazio") == "vazio":
                alerts.add(
                    row_id,
                    column["destino"],
                    value,
                    "valor_especial",
                    special.get("significado") or "Valor especial da fonte.",
                )
                return None
            break
    if is_blank(value):
        return None
    kind = column["tipo"]
    if kind == "numero":
        number = to_number(value)
        if number is None:
            alerts.add(
                row_id,
                column["destino"],
                value,
                "valor_nao_numerico",
                "Texto em coluna numérica; mantido só no alerta.",
            )
        return number
    if kind == "data":
        date = to_date(value)
        if date is None:
            alerts.add(row_id, column["destino"], value, "data_invalida", "Data que não pôde ser lida.")
        elif not 1950 <= date.year <= 2100:
            alerts.add(
                row_id, column["destino"], value, "data_suspeita", f"Ano {date.year} fora do plausível."
            )
        return date
    if kind == "booleano":
        text = norm(value)
        if text in TRUE:
            return True
        if text in FALSE:
            return False
        alerts.add(row_id, column["destino"], value, "booleano_invalido", "Valor que não é sim/não.")
        return None
    return to_text(value)


def apply_table(psi: str, table: dict, files_dir: Path) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Lê uma tabela da especificação. Cada linha leva arquivo, aba e linha de origem."""
    alerts = Alerts(psi)
    columns = [c for c in table["colunas"] if c.get("natureza") != "IGNORAR"]
    id_columns = [c["destino"] for c in columns if c.get("natureza") == "IDENTIFICADOR"]
    exclusions = table.get("excluir_linhas") or []
    records = []
    for source in table["fontes"]:
        rows = read_rows(files_dir / source["arquivo"], source.get("aba"))
        header_line = source["linha_cabecalho"]
        positions = {norm(h): i for i, h in enumerate(rows[header_line - 1]) if not is_blank(h)}
        missing = [c["origem"] for c in columns if norm(c["origem"]) not in positions]
        if missing:
            raise SpecError(f"{source['arquivo']}: colunas ausentes no cabeçalho: {missing}")
        for line, row in enumerate(rows[header_line:], start=header_line + 1):
            if all(is_blank(c) for c in row):
                continue
            cells = {c["destino"]: positions[norm(c["origem"])] for c in columns}
            raw = {name: (row[i] if i < len(row) else None) for name, i in cells.items()}
            row_id = " · ".join(str(to_text(raw[i]) or "?") for i in id_columns) or f"linha {line}"
            excluded = next(
                (
                    e
                    for e in exclusions
                    if norm(raw.get(e.get("coluna"))) in {norm(v) for v in e.get("valores", [])}
                ),
                None,
            )
            if excluded:
                alerts.add(row_id, excluded["coluna"], raw.get(excluded["coluna"]), "linha_excluida",
                           excluded.get("motivo") or "Linha que não é um registro de dado.")  # fmt: skip
                continue
            record = {c["destino"]: _convert(alerts, row_id, c, raw[c["destino"]]) for c in columns}
            if table.get("layout") == "empilhado":
                record[table["coluna_fonte"]] = source.get("rotulo") or source.get("aba") or source["arquivo"]
            record |= {
                "fonte_arquivo": source["arquivo"],
                "fonte_aba": source.get("aba"),
                "linha_fonte": line,
            }
            records.append(record)
    frame = pl.DataFrame(records, infer_schema_length=None) if records else pl.DataFrame()
    return frame, alerts.frame()


def apply(spec: dict, files_dir: Path) -> tuple[dict[str, pl.DataFrame], pl.DataFrame, pl.DataFrame]:
    """Aplica a especificação inteira. Devolve tabelas (nome no banco → linhas), alertas e o dicionário das
    colunas (o que cada uma é, de onde veio a interpretação)."""
    psi = spec["investigacao"]["id"]
    tables, alerts, dictionary = {}, [], []
    for table in spec["tabelas"]:
        frame, found = apply_table(psi, table, files_dir)
        tables[table_name(psi, table["nome"])] = frame
        alerts.append(found)
        for c in table["colunas"]:
            if c.get("natureza") == "IGNORAR":
                continue
            evidence = c.get("evidencia") or {}
            dictionary.append({
                "investigacao": psi, "tabela": table_name(psi, table["nome"]), "coluna": c["destino"],
                "origem": c["origem"], "descricao": c.get("descricao"), "unidade": c.get("unidade"),
                "natureza": c["natureza"], "tipo": c["tipo"], "atributo": c.get("atributo"),
                "grandeza": c.get("grandeza"),
                "evidencia_tipo": evidence.get("tipo"),
                "evidencia_arquivo": evidence.get("arquivo"), "evidencia_pagina": evidence.get("pagina"),
                "evidencia_trecho": evidence.get("trecho"), "confirmado": bool(c.get("confirmado")),
            })  # fmt: skip
    return (
        tables,
        pl.concat(alerts) if alerts else pl.DataFrame(),
        pl.DataFrame(dictionary, infer_schema_length=None),
    )


def investigation_row(spec: dict) -> dict:
    """A linha de `investigacoes` de um estudo enviado, no mesmo formato das do catálogo."""
    inv = spec["investigacao"]
    first = spec["tabelas"][0]["nome"]
    cautions = inv.get("cautelas") or []
    text = " ".join(c["texto"] if isinstance(c, dict) else str(c) for c in cautions)
    return {
        "id": inv["id"], "nome": inv["nome"], "categoria": inv["categoria"], "ambiente": inv["ambiente"],
        "tipo_evidencia": inv["tipo_evidencia"], "tabela": table_name(inv["id"], first), "pergunta": inv["pergunta"],
        "cautelas": text, "url_nasa": inv.get("url_nasa") or f"https://psi.nasa.gov/physci/repo/data/investigations/{inv['id']}",
        "doi": inv.get("doi"), "relatorio": inv.get("relatorio"),
    }  # fmt: skip
