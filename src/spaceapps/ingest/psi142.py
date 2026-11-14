"""PSI-142 — limites de extinção de chamas frias em contrafluxo (Princeton, investigação em solo).

Não são ensaios: são pontos digitalizados de figuras de artigos, um conjunto por aba
(`data ID 1` … `data ID 8`). Cada conjunto vira séries (x, y) numa tabela longa. A aba
`data summary` e o CSV `Data Summary Table` descrevem os conjuntos; quando discordam, os dois
textos ficam registrados e entra um alerta.
"""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl
from openpyxl import load_workbook

from .common import Alerts, read_csv_rows, to_number, to_text

INVESTIGACAO = "PSI-142"

# Como cada aba está desenhada. "vertical": blocos um embaixo do outro, cada um com um cabeçalho
# (rótulo, nome x, nome y) nas colunas dadas. "horizontal": blocos lado a lado num cabeçalho de
# linha fixa, cada bloco ocupando (rótulo, x, y). "largo": uma coluna x e várias colunas y.
LAYOUTS = {
    "data ID 1": ("vertical", 2, 3, 4),
    "data ID 2": ("vertical", 2, 3, 4),
    "data ID 3": ("vertical", 2, 3, 4),
    "data ID 4": ("largo", 3, 2, (3, 4)),
    "data ID 5": ("horizontal", 3, (1, 5, 9, 13)),
    "data ID 6": ("horizontal", 3, (2, 6, 10)),
    "data ID 7": ("horizontal", 3, (2, 6, 10)),
    "data ID 8": ("vertical", 2, 2, 3),
}


def _cell(row: tuple, i: int) -> object:
    return row[i] if i < len(row) else None


def _vertical(rows, label_col, x_col, y_col):
    """Blocos empilhados. Se o rótulo divide coluna com o x (aba 8), ele vem numa linha própria."""
    label = x_name = y_name = None
    for line, row in enumerate(rows, start=1):
        lab, x, y = _cell(row, label_col), _cell(row, x_col), _cell(row, y_col)
        if isinstance(x, str) and isinstance(y, str):  # cabeçalho do bloco
            if label_col != x_col:
                label = to_text(lab) or label
            x_name, y_name = to_text(x), to_text(y)
        elif isinstance(lab, str) and y is None and not str(lab).lower().startswith("data id"):
            label = to_text(lab)  # rótulo sozinho na linha
        elif (xv := to_number(x)) is not None and (yv := to_number(y)) is not None and x_name:
            yield label, x_name, y_name, xv, yv, line


def _check_header(rows, header_line, cols, sheet_hint):
    """Recusa a aba se a linha de cabeçalho não tiver texto onde se espera: o layout mudou."""
    header = rows[header_line - 1] if len(rows) >= header_line else ()
    if not all(isinstance(_cell(header, c), str) for c in cols):
        raise ValueError(
            f"aba {sheet_hint}: cabeçalho esperado na linha {header_line}, colunas {list(cols)}."
        )
    return header


def _horizontal(rows, header_line, label_cols):
    header = _check_header(rows, header_line, [c + k for c in label_cols for k in (0, 1, 2)], "lado a lado")
    blocks = [(c, to_text(_cell(header, c)), to_text(_cell(header, c + 1)), to_text(_cell(header, c + 2)))
              for c in label_cols]  # fmt: skip
    for line, row in enumerate(rows[header_line:], start=header_line + 1):
        for c, label, x_name, y_name in blocks:
            xv, yv = to_number(_cell(row, c + 1)), to_number(_cell(row, c + 2))
            if xv is not None and yv is not None:
                yield label, x_name, y_name, xv, yv, line


def _wide(rows, header_line, x_col, y_cols):
    header = _check_header(rows, header_line, [x_col, *y_cols], "x e várias colunas y")
    x_name = to_text(_cell(header, x_col))
    for line, row in enumerate(rows[header_line:], start=header_line + 1):
        xv = to_number(_cell(row, x_col))
        for c in y_cols:
            if xv is not None and (yv := to_number(_cell(row, c))) is not None:
                name = to_text(_cell(header, c))
                yield name, x_name, name, xv, yv, line


def _unit(name: str | None) -> str | None:
    match = re.search(r"[\(\[]\s*([^\)\]]+?)\s*[\)\]]", name or "")
    return match[1] if match else None


def load(path: Path, csv_path: Path | None = None) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Devolve os conjuntos (metadados), os pontos (tabela longa) e os alertas."""
    workbook = load_workbook(path, read_only=True, data_only=True)
    alerts = Alerts(INVESTIGACAO)

    summary = {}
    for row in workbook["data summary"].iter_rows(values_only=True):
        if (cid := to_number(_cell(row, 1))) is not None:
            summary[int(cid)] = {"publicacao": to_text(_cell(row, 2)), "figura": to_text(_cell(row, 3)),
                                 "descricao_planilha": to_text(_cell(row, 4))}  # fmt: skip
    from_csv = {}
    if csv_path is not None:
        for row in read_csv_rows(csv_path)[1:]:
            if row and (cid := to_number(row[0])) is not None:
                from_csv[int(cid)] = {"descricao_csv": to_text(row[1]), "doi": to_text(row[2]),
                                      "figura_csv": to_text(row[3])}  # fmt: skip

    points = []
    for sheet_name, layout in LAYOUTS.items():
        if sheet_name not in workbook.sheetnames:
            raise ValueError(f"{path.name}: aba '{sheet_name}' não encontrada.")
        cid = int(sheet_name.split()[-1])
        rows = list(workbook[sheet_name].iter_rows(values_only=True))
        kind, *args = layout
        reader = {"vertical": _vertical, "horizontal": _horizontal, "largo": _wide}[kind]
        for label, x_name, y_name, xv, yv, line in reader(rows, *args):
            points.append({"conjunto_id": cid, "serie": label, "x_nome": x_name, "x_unidade": _unit(x_name),
                           "x": xv, "y_nome": y_name, "y_unidade": _unit(y_name), "y": yv,
                           "aba_fonte": sheet_name, "linha_fonte": line})  # fmt: skip
    workbook.close()
    table = pl.DataFrame(points, infer_schema_length=None)

    sets = []
    for cid in sorted(set(summary) | set(from_csv)):
        s, c = summary.get(cid, {}), from_csv.get(cid, {})
        sets.append({"conjunto_id": cid, **{k: s.get(k) for k in ("publicacao", "figura", "descricao_planilha")},
                     **{k: c.get(k) for k in ("descricao_csv", "doi", "figura_csv")},
                     "pontos": table.filter(pl.col("conjunto_id") == cid).height})  # fmt: skip
        _compare(alerts, cid, s, c)
    _same_paper_different_doi(alerts, summary, from_csv)
    _swapped_axes(alerts, table)
    return pl.DataFrame(sets), table, alerts.frame()


def _ozone(text: str | None) -> str | None:
    t = (text or "").lower()
    if re.search(r"\b(no|without|sem)\s+ozone", t):
        return "sem"
    return "com" if "ozone" in t else None


def _compare(alerts: Alerts, cid: int, s: dict, c: dict) -> None:
    if not s or not c:
        return
    a, b = _ozone(s.get("descricao_planilha")), _ozone(c.get("descricao_csv"))
    both = f"planilha: {s['descricao_planilha']} | CSV: {c['descricao_csv']}"
    if a and b and a != b:
        detail = "Planilha e CSV discordam sobre a presença de ozônio. Conferir no artigo."
        alerts.add(f"conjunto {cid}", "descricao", both, "metadado_conflitante", detail)
    elif cid == 3 or (s.get("figura") and c.get("figura_csv") and s["figura"] != c["figura_csv"]):
        if s.get("descricao_planilha", "").lower() not in (c.get("descricao_csv") or "").lower():
            detail = "Planilha e CSV descrevem o conjunto de formas diferentes."
            alerts.add(f"conjunto {cid}", "descricao", both, "metadado_divergente", detail)


def _same_paper_different_doi(alerts: Alerts, summary: dict, from_csv: dict) -> None:
    by_paper: dict[str, set] = {}
    for cid, s in summary.items():
        if (doi := from_csv.get(cid, {}).get("doi")) and s.get("publicacao"):
            by_paper.setdefault(s["publicacao"], set()).add((cid, doi))
    for paper, items in by_paper.items():
        if len({doi for _, doi in items}) > 1:
            ids = ", ".join(str(cid) for cid, _ in sorted(items))
            dois = "; ".join(d for _, d in sorted(items))
            detail = f"A planilha atribui estes conjuntos ao mesmo artigo ({paper[:60]}…); o CSV dá DOIs diferentes."
            alerts.add(f"conjuntos {ids}", "doi", dois, "metadado_conflitante", detail)


def _swapped_axes(alerts: Alerts, table: pl.DataFrame) -> None:
    """Num mesmo conjunto, os perfis por distância cobrem a mesma região do queimador. Uma série cuja
    "distância" vai muito além das outras (ex.: 554 contra 2,1 cm) provavelmente teve as colunas
    trocadas na fonte. Só avisa; não troca nada."""
    profiles = table.filter(pl.col("x_nome").str.contains("(?i)distance|location"))
    spans = profiles.group_by("conjunto_id", "serie", "x_nome", "y_nome", maintain_order=True).agg(
        pl.col("x").max().alias("x_max")
    )
    for (cid, _x), group in spans.group_by("conjunto_id", "x_nome", maintain_order=True):  # só eixos iguais
        smallest = group["x_max"].min()
        if group.height < 2 or not smallest or smallest <= 0:
            continue
        for serie, x_name, x_max in group.select("serie", "x_nome", "x_max").iter_rows():
            if x_max > 5 * smallest:
                alerts.add(f"conjunto {cid} · {serie}", "x", f"{x_name} até {x_max:g}", "eixo_suspeito",
                           f"A distância vai até {x_max:g}, contra {smallest:g} nas outras séries do conjunto: "
                           "colunas x e y provavelmente trocadas na fonte. Mantido como está.")  # fmt: skip
