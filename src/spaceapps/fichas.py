"""Fichas lado a lado: o que dois ou mais estudos têm em comum, calculado das fichas, sem IA.

Faixas que se cruzam dizem que existe uma janela comparável, não que os testes foram feitos nas mesmas
condições combinadas: a resposta sempre traz também os vínculos de cada estudo e os avisos do par.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from itertools import combinations

import polars as pl

from .ingest.ficha import ATRIBUTOS, GRANDEZAS, LIST_SEP
from .ingest.metadados import acronyms
from .search import fold

NUMERICOS = ["oxigenio", "pressao", "helio", "tamanho_amostra", "tamanho_queimador", "velocidade_fluxo",
             "temperatura"]  # fmt: skip
CATEGORICOS = ["combustivel", "forma_amostra", "suporte", "diluente", "agente_extintor"]
ESCALA = {"oxigenio": (100, "%"), "helio": (100, "%")}  # como mostrar (a ficha guarda fração)
NAO_E_VALOR = {"nao escrito na fonte", "nao informado", ""}
TOLERANCIA = 0.02  # 1,00 atm e 0,997 atm são a mesma pressão de laboratório

# pares com uma relação que a ficha não vê (verificada à parte, com a tabela que a prova)
AVISOS_PARES = {
    frozenset({"PSI-117", "PSI-39"}): "As medições do PSI-117 são ensaios do CFI (veja PSI-117 × CFI): "
    "comparar os dois não é validação independente.",
}


@dataclass
class Par:
    a: str
    b: str
    veredito: str = ""
    sobrepoe: list[str] = field(default_factory=list)
    nao_sobrepoe: list[str] = field(default_factory=list)
    so_um: list[str] = field(default_factory=list)
    grandezas_comuns: list[str] = field(default_factory=list)
    combustiveis_comuns: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "par": f"{self.a} × {self.b}",
            **{k: v for k, v in self.__dict__.items() if k not in ("a", "b")},
        }


def label(attr: str) -> str:
    return ATRIBUTOS[attr][1]


def show(attr: str, value: float) -> str:
    scale, _ = ESCALA.get(attr, (1, None))
    return f"{value * scale:.3g}"


def unit(attr: str) -> str:
    return ESCALA.get(attr, (1, ATRIBUTOS[attr][2]))[1] or ""


def ranges(sheet: pl.DataFrame, attr: str) -> dict[str, tuple[float, float]]:
    """Faixa de um atributo em cada estudo, só na unidade comum (o que não foi convertido fica de fora)."""
    out: dict[str, tuple[float, float]] = {}
    rows = sheet.filter((pl.col("atributo") == attr) & (pl.col("unidade") == ATRIBUTOS[attr][2]))
    if "origem" in rows.columns:  # os dados valem mais que o documento: ele só entra onde os dados calam
        from_data = set(rows.filter(pl.col("origem") == "dados")["investigacao"])
        rows = rows.filter((pl.col("origem") != "documento") | ~pl.col("investigacao").is_in(list(from_data)))
    for r in rows.drop_nulls(["minimo", "maximo"]).iter_rows(named=True):
        old = out.get(r["investigacao"])
        lo, hi = r["minimo"], r["maximo"]
        out[r["investigacao"]] = (min(lo, old[0]), max(hi, old[1])) if old else (lo, hi)
    return out


def names(row: dict) -> list[str]:
    """Os valores de uma linha categórica: a lista completa, ou o resumo 'a (3), b (2)…' quando não há."""
    if row.get("lista"):
        return row["lista"].split(LIST_SEP)
    parts = re.split(r", (?![^(]*\))", (row.get("valores") or "").rstrip("…"))
    return [re.sub(r" \(\d+\)$", "", p).strip() for p in parts if p.strip()]


def categories(sheet: pl.DataFrame, attr: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for r in sheet.filter(pl.col("atributo") == attr).iter_rows(named=True):
        found = [n for n in names(r) if fold(n) not in NAO_E_VALOR]
        out.setdefault(r["investigacao"], []).extend(
            n for n in found if n not in out.get(r["investigacao"], [])
        )
    return out


def quantities(sheet: pl.DataFrame) -> dict[str, dict[str, list[str]]]:
    """Estudo → grandeza medida → rótulos das colunas que a medem."""
    out: dict[str, dict[str, list[str]]] = {}
    for r in sheet.filter(pl.col("grandeza").is_not_null()).iter_rows(named=True):
        for key in r["grandeza"].split(LIST_SEP):
            if key != "outra_medicao":
                out.setdefault(r["investigacao"], {}).setdefault(key, []).append(r["rotulo"])
    return out


def overlap(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float] | None:
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    return (lo, hi) if lo <= hi * (1 + TOLERANCIA) + 1e-12 else None


def common_window(selected: list[tuple[float, float]]) -> tuple[float, float] | None:
    window = selected[0]
    for other in selected[1:]:
        window = overlap(window, other)
        if window is None:
            return None
    return window


def range_text(attr: str, r: tuple[float, float]) -> str:
    text = (
        show(attr, r[0]) if show(attr, r[0]) == show(attr, r[1]) else f"{show(attr, r[0])}–{show(attr, r[1])}"
    )
    return f"{text} {unit(attr)}".strip()


def compare_pair(
    sheet: pl.DataFrame,
    links: pl.DataFrame,
    investigations: dict[str, dict],
    a: str,
    b: str,
    metadata: dict[str, dict] | None = None,
) -> Par:
    par = Par(a, b)
    for attr in NUMERICOS:
        found = ranges(sheet, attr)
        ra, rb = found.get(a), found.get(b)
        if ra and rb:
            both = overlap(ra, rb)
            if both:
                par.sobrepoe.append(f"{label(attr)}: {range_text(attr, both)}")
            else:
                par.nao_sobrepoe.append(
                    f"{label(attr)}: {a} {range_text(attr, ra)} × {b} {range_text(attr, rb)}"
                )
        elif ra or rb:
            par.so_um.append(f"{label(attr)} (só {a if ra else b} registra)")
    fuels = categories(sheet, "combustivel")
    folded_b = {fold(n): n for n in fuels.get(b, [])}
    par.combustiveis_comuns = [n for n in fuels.get(a, []) if fold(n) in folded_b]
    measured = quantities(sheet)
    par.grandezas_comuns = [GRANDEZAS[q][0] for q in measured.get(a, {}) if q in measured.get(b, {})]

    different_fuels = bool(fuels.get(a) and fuels.get(b) and not par.combustiveis_comuns)
    if not par.grandezas_comuns:
        par.veredito = "Nada medido em comum"
    elif par.nao_sobrepoe:
        par.veredito = "Condições sem sobreposição"
    elif not par.sobrepoe:
        par.veredito = "Sem condição numérica em comum"
    elif different_fuels:
        par.veredito = "Combustíveis diferentes"
    else:
        par.veredito = "Janela comparável"

    if warning := AVISOS_PARES.get(frozenset({a, b})):
        par.avisos.append(warning)
    ia, ib = investigations.get(a, {}), investigations.get(b, {})
    if ia.get("ambiente") and ia.get("ambiente") != ib.get("ambiente"):
        par.avisos.append(f"Ambientes diferentes: {ia['ambiente']} × {ib['ambiente']}.")
    if ia.get("tipo_evidencia") and ia.get("tipo_evidencia") != ib.get("tipo_evidencia"):
        par.avisos.append(f"Evidências de tipos diferentes: {ia['tipo_evidencia']} × {ib['tipo_evidencia']}.")
    hardware_a = (metadata or {}).get(a, {}).get("equipamento")
    hardware_b = (metadata or {}).get(b, {}).get("equipamento")
    if shared := sorted(acronyms(hardware_a) & acronyms(hardware_b)):
        par.avisos.append(
            f"Mesmo equipamento ({', '.join(shared)}, segundo os metadados do portal): um viés do aparelho "
            "afetaria os dois e não apareceria na comparação."
        )
    if different_fuels and par.grandezas_comuns:
        par.avisos.append("Nenhum combustível ou material em comum: diferenças podem vir do combustível.")
    crossed = {attr for attr in NUMERICOS if label(attr) in {t.split(":")[0] for t in par.sobrepoe}}
    if crossed and links.height and "atributo_a" in links.columns:
        # só os vínculos entre condições cujas faixas se cruzam (ou com o combustível): os que afetam a janela
        relevant = crossed | {"combustivel"}
        tied = links.filter(
            pl.col("investigacao").is_in([a, b])
            & pl.col("atributo_a").is_in(list(relevant))
            & pl.col("atributo_b").is_in(list(relevant))
        )
        if tied.height:
            par.avisos.append(
                "Faixas que se cruzam não garantem testes nas mesmas condições combinadas: "
                + "; ".join(
                    f"{r['investigacao']}: {r['variavel_a']} × {r['variavel_b']}"
                    for r in tied.head(4).iter_rows(named=True)
                )  # fmt: skip
                + " não variaram de forma independente."
            )
    return par


def side_by_side(
    sheet: pl.DataFrame, ids: list[str], metadata: dict[str, dict] | None = None
) -> pl.DataFrame:
    """Uma linha por atributo, uma coluna por estudo, tudo na unidade comum."""
    rows = []
    hardware = {i: (metadata or {}).get(i, {}).get("equipamento") for i in ids}
    if any(hardware.values()):
        rows.append({"atributo": "Equipamento (portal)", **{i: hardware[i] or "—" for i in ids}})
    for attr in CATEGORICOS[:2] + NUMERICOS + CATEGORICOS[2:]:
        if attr in NUMERICOS:
            found = {k: range_text(attr, v) for k, v in ranges(sheet, attr).items()}
        else:
            found = {
                k: ", ".join(v[:4]) + (" …" if len(v) > 4 else "") for k, v in categories(sheet, attr).items()
            }
        if any(i in found for i in ids):
            rows.append({"atributo": label(attr), **{i: found.get(i, "—") for i in ids}})
    measured = quantities(sheet)
    for key, (name, _) in GRANDEZAS.items():
        if any(key in measured.get(i, {}) for i in ids):
            rows.append({"atributo": f"Mede: {name}",
                         **{i: "; ".join(measured.get(i, {}).get(key, [])) or "—" for i in ids}})  # fmt: skip
    return pl.DataFrame(rows, schema={"atributo": pl.String, **dict.fromkeys(ids, pl.String)})


def compare(
    sheet: pl.DataFrame,
    links: pl.DataFrame,
    investigations: pl.DataFrame,
    ids: list[str],
    metadata: pl.DataFrame | None = None,
) -> dict:
    """Tabela lado a lado, janelas comuns a todos e o veredito de cada par."""
    known = {r["id"]: r for r in investigations.iter_rows(named=True)}
    portal = {r["investigacao"]: r for r in metadata.iter_rows(named=True)} if metadata is not None else {}
    windows = {}
    for attr in NUMERICOS:
        found = ranges(sheet, attr)
        if all(i in found for i in ids):
            window = common_window([found[i] for i in ids])
            windows[label(attr)] = range_text(attr, window) if window else "sem faixa comum a todos"
    return {
        "tabela": side_by_side(sheet, ids, portal),
        "janelas_comuns": windows,
        "pares": [compare_pair(sheet, links, known, a, b, portal) for a, b in combinations(ids, 2)],
    }
