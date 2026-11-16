"""Ficha de cada estudo, calculada dos dados: combustíveis, amostras, condições, medições, e o que
variou e o que ficou fixo entre os testes. Sem IA: roda igual em toda carga.

- `ATRIBUTOS` é o vocabulário comum, com a unidade de cada atributo. É ele que permite comparar estudos
  (O2 sempre como fração, pressão sempre em atm, tamanhos sempre em mm).
- `PAPEIS` diz, para as tabelas do catálogo, qual atributo cada coluna representa e como converter.
  Estudos enviados trazem o atributo na própria especificação (`atributo` em cada coluna).
- `vinculos` acha condições que variaram juntas (ex.: pressão alta só com 21% de O2), que impedem
  atribuir um efeito a uma delas sozinha.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import polars as pl

from ..datasets.vocabulary import ATRIBUTOS, LIST_SEP

# composição do gás: N2 é o que sobra de O2 e He, e o diluente repete o hélio; não são vínculos a avisar
NAO_VINCULAR = {frozenset({"nitrogenio", "oxigenio"}), frozenset({"nitrogenio", "helio"}),
                frozenset({"diluente", "helio"}), frozenset({"diluente", "nitrogenio"})}  # fmt: skip


@dataclass(frozen=True)
class Papel:
    atributo: str
    rotulo: str
    fator: float = 1.0  # multiplica o valor da coluna para a unidade comum
    unidade: str | None = None  # para medições (cada uma tem a sua)
    natureza: str = "CONDICAO"
    nota: str | None = None
    grandeza: str | None = None  # só para medições: chave de GRANDEZAS
    grandeza_por_valor: dict[str, str] | None = None  # quando cada linha diz o que mediu (coluna de nomes)


# tabela do catálogo → coluna → papel
PAPEIS: dict[str, dict[str, Papel]] = {
    "flex_ensaios": {
        "combustivel": Papel("combustivel", "Combustível"),
        "diametro_inicial_mm": Papel("tamanho_amostra", "Diâmetro inicial da gota"),
        "pressao_mmhg": Papel("pressao", "Pressão", 1 / 760),
        "oxigenio_fracao": Papel("oxigenio", "Oxigênio"),
        "nitrogenio_fracao": Papel("nitrogenio", "Nitrogênio"),
        "helio_fracao": Papel("helio", "Hélio"),
        "gas_co_rotulo_ambiguo_fracao": Papel(
            "outra_condicao",
            "Gás com rótulo 'CO' (ambíguo)",
            nota="O cabeçalho perdeu o subscrito; pode ser CO2.",
        ),
        "diametro_extincao_visivel_mm": Papel(
            "medicao",
            "Diâmetro na extinção visível",
            unidade="mm",
            natureza="MEDIDO",
            grandeza="diametro_extincao",
        ),
        "tempo_queima_s": Papel(
            "medicao", "Tempo de queima", unidade="s", natureza="MEDIDO", grandeza="tempo_queima"
        ),
        "taxa_queima_valor": Papel(
            "medicao", "Taxa de queima", unidade="a conferir", natureza="MEDIDO", grandeza="taxa_queima"
        ),
        "desfecho": Papel("medicao", "Desfecho do ensaio", natureza="MEDIDO", grandeza="desfecho"),
    },
    "bass_ensaios": {
        "material_categoria": Papel("combustivel", "Material"),
        "geometria": Papel("forma_amostra", "Geometria"),
        "espessura_mm": Papel("tamanho_amostra", "Espessura"),
        "largura_cm": Papel("tamanho_amostra", "Largura", 10),
        "diametro_mm": Papel("tamanho_amostra", "Diâmetro (hastes e esferas)"),
        "o2_inicial_pct": Papel("oxigenio", "Oxigênio inicial", 0.01),
        "restritor_fluxo": Papel("ventilacao", "Restritor de fluxo", nota="Código da configuração."),
        "ventilador_display": Papel(
            "ventilacao", "Ventilador", nota="Leituras de painel em texto livre, sem calibração."
        ),
        "o2_final_pct": Papel(
            "medicao", "O2 final", unidade="% vol", natureza="MEDIDO", grandeza="gases_queima"
        ),
        "delta_co2_pp": Papel(
            "medicao",
            "CO2 produzido (final − inicial)",
            unidade="p.p.",
            natureza="MEDIDO",
            grandeza="gases_queima",
        ),
        "delta_co_ppm": Papel(
            "medicao",
            "CO produzido (final − inicial)",
            unidade="ppm",
            natureza="MEDIDO",
            grandeza="gases_queima",
        ),
        "quadros_total": Papel(
            "medicao", "Quadros filmados", unidade="quadros", natureza="MEDIDO", grandeza="outra_medicao"
        ),
    },
    "cfi_ensaios": {
        "combustivel": Papel("combustivel", "Combustível"),
        "d0_mm": Papel("tamanho_amostra", "Diâmetro inicial da gota"),
        "fibra": Papel("suporte", "Gota presa em fibra"),
        "pressao_atm": Papel("pressao", "Pressão"),
        "oxigenio_fracao": Papel("oxigenio", "Oxigênio"),
        "nitrogenio_fracao": Papel("nitrogenio", "Nitrogênio"),
        "helio_fracao": Papel("helio", "Hélio"),
        "diluente": Papel("diluente", "Diluente"),
        "dext_quente_mm": Papel(
            "medicao",
            "Diâmetro de extinção da chama quente",
            unidade="mm",
            natureza="MEDIDO",
            grandeza="diametro_extincao",
        ),
        "dext_fria_mm": Papel(
            "medicao",
            "Diâmetro de extinção da chama fria",
            unidade="mm",
            natureza="MEDIDO",
            grandeza="diametro_extincao",
        ),
        "k_quente_mm2_s": Papel(
            "medicao",
            "Taxa de queima (chama quente)",
            unidade="mm²/s",
            natureza="MEDIDO",
            grandeza="taxa_queima",
        ),
        "k_fria_mm2_s": Papel(
            "medicao",
            "Taxa de queima (chama fria)",
            unidade="mm²/s",
            natureza="MEDIDO",
            grandeza="taxa_queima",
        ),
        "reignicoes": Papel(
            "medicao", "Reignições", unidade="contagem", natureza="MEDIDO", grandeza="outra_medicao"
        ),
        "rad_pico_chama_quente": Papel(
            "medicao",
            "Radiometria (pico da chama quente)",
            unidade="não informada",
            natureza="MEDIDO",
            grandeza="emissao_chama",
        ),
    },
    "psi117_extincao": {
        "pressao_atm": Papel("pressao", "Pressão"),
        "diametro_extincao_mm": Papel(
            "medicao",
            "Diâmetro de extinção (medido e simulado)",
            unidade="mm",
            natureza="MEDIDO",
            grandeza="diametro_extincao",
        ),
    },
    "psi117_extincao_1atm": {
        "combustivel": Papel("combustivel", "Combustível"),
        "d0_mm": Papel("tamanho_amostra", "Diâmetro inicial da gota"),
    },
    "psi142_pontos": {
        "serie": Papel("outra_condicao", "Série da figura (combustível ou condição)"),
        "y_nome": Papel(
            "medicao",
            "Grandezas nos gráficos",
            natureza="DIGITALIZADO",
            grandeza_por_valor={
                "chemi. signal [counts]": "emissao_chama",
                "PLIF signal [a.u.]": "emissao_chama",
                "aCFE (1/s)": "taxa_estiramento_extincao",
                "aHFE (1/s)": "taxa_estiramento_extincao",
                "temperature [K]": "temperatura_chama",
                "T_max [K]": "temperatura_chama",
                "ϕ_HFE": "outra_medicao",
                "ϕ_CFE": "outra_medicao",
            },
            nota="Cada ponto diz a grandeza do eixo y da figura digitalizada.",
        ),  # fmt: skip
    },
}

# o que não está em coluna mas é parte do desenho do estudo (com a fonte)
FIXOS = {
    "PSI-69": [("forma_amostra", "Formato da amostra", "gota esférica", "descrição da investigação")],
    "PSI-39": [("forma_amostra", "Formato da amostra", "gota esférica", "descrição da investigação")],
    "PSI-117": [
        ("forma_amostra", "Formato da amostra", "gota esférica (modelo e voos)", "ReadMe da investigação")
    ],
    "PSI-142": [
        (
            "forma_amostra",
            "Formato da chama",
            "chama em contrafluxo (jatos opostos)",
            "descrição da investigação",
        )
    ],
}


# unidade da fonte → fator para a unidade comum do atributo (chave sem acento, minúscula, sem espaços)
CONVERSOES = {
    "pressao": {"atm": 1, "kpa": 1 / 101.325, "pa": 1 / 101325, "mmhg": 1 / 760, "torr": 1 / 760,
                "bar": 1 / 1.01325, "psi": 1 / 14.696, "psia": 1 / 14.696},
    "oxigenio": {"fracao": 1, "fracaomolar": 1, "%": 0.01, "%vol": 0.01, "pct": 0.01},
    "helio": {"fracao": 1, "fracaomolar": 1, "%": 0.01, "%vol": 0.01, "pct": 0.01},
    "nitrogenio": {"fracao": 1, "fracaomolar": 1, "%": 0.01, "%vol": 0.01, "pct": 0.01},
    "tamanho_amostra": {"mm": 1, "cm": 10, "m": 1000, "um": 0.001, "µm": 0.001, "in": 25.4, "pol": 25.4},
    "tamanho_queimador": {"mm": 1, "cm": 10, "m": 1000, "um": 0.001, "µm": 0.001, "in": 25.4, "pol": 25.4},
    "velocidade_fluxo": {"cm/s": 1, "mm/s": 0.1, "m/s": 100},
    "temperatura": {"k": 1},
}  # fmt: skip


def conversion(attr: str, unit: str | None) -> float | None:
    """Fator da unidade da fonte para a comum; None se não se sabe converter (a ficha mantém a da fonte)."""
    table = CONVERSOES.get(attr)
    if table is None:
        return 1.0
    if not unit:
        return 1.0 if attr in ("oxigenio", "helio", "nitrogenio") else None  # sem unidade: fração
    key = "".join(unit.lower().replace("ç", "c").replace("ã", "a").split())
    if attr in ("oxigenio", "helio", "nitrogenio") and key.startswith("%"):
        return 0.01  # "% O2", "% vol", "%(v/v)": porcentagem da mistura
    return table.get(key)


def _lower(label: str) -> str:
    """Rótulo no meio da frase: 'Pressão' → 'pressão', mas 'CO2 final' e "'CO'" ficam como estão."""
    return label[0].lower() + label[1:] if len(label) > 1 and label[1].islower() else label


def _factor_text(factor: float) -> str:
    if factor == 1:
        return ""
    inverse = 1 / factor
    return f" ÷ {inverse:g}" if factor < 1 and abs(inverse - round(inverse)) < 1e-6 else f" × {factor:g}"


def _fmt(value: float) -> str:
    return f"{value:.3g}" if abs(value) < 1000 else f"{value:,.0f}".replace(",", ".")


MAX_LIST = 60


def describe(frame: pl.DataFrame, column: str, papel: Papel) -> dict | None:
    """Uma linha da ficha para uma coluna: faixa ou valores, níveis, variou ou fixo."""
    if column not in frame.columns:
        return None
    section, label, unit, kind = ATRIBUTOS[papel.atributo]
    series = frame[column].drop_nulls()
    row = {"secao": section, "atributo": papel.atributo, "rotulo": papel.rotulo, "coluna": column,
           "unidade": papel.unidade or (None if papel.atributo == "medicao" else unit), "natureza": papel.natureza,
           "registros": series.len(), "niveis": series.n_unique(), "minimo": None, "maximo": None,
           "valores": None, "lista": None, "nota": papel.nota,
           "grandeza": papel.grandeza if papel.atributo == "medicao" else None}  # fmt: skip
    if series.is_empty():
        return row | {"situacao": "sem dados"}
    numeric = series.dtype.is_numeric() and series.dtype != pl.Boolean
    if numeric:
        values = series.cast(pl.Float64) * papel.fator
        row |= {"minimo": float(values.min()), "maximo": float(values.max())}
        row["valores"] = (
            _fmt(row["minimo"]) if row["niveis"] == 1 else f"{_fmt(row['minimo'])} – {_fmt(row['maximo'])}"
        )
    else:
        distinct = series.cast(pl.String).unique().sort()
        if distinct.len() <= MAX_LIST:  # a lista inteira, para cruzar estudos (ex.: o mesmo combustível)
            row["lista"] = LIST_SEP.join(distinct.to_list())
        counts = series.cast(pl.String).value_counts(sort=True).head(6)
        row["valores"] = ", ".join(f"{v} ({n})" for v, n in counts.iter_rows()) + (
            "…" if row["niveis"] > 6 else ""
        )
    if papel.grandeza_por_valor:
        found = {papel.grandeza_por_valor.get(v, "outra_medicao") for v in series.cast(pl.String).unique()}
        row["grandeza"] = LIST_SEP.join(sorted(found))
    if papel.atributo == "medicao":
        row["situacao"] = "medido" if papel.natureza == "MEDIDO" else papel.natureza.lower()
    else:
        row["situacao"] = "variou" if row["niveis"] > 1 else "fixo"
    return row


# atributos que descrevem a própria amostra: variam juntos por definição (material, forma e tamanho são
# o mesmo objeto), então não são "condições que variaram juntas"
DA_AMOSTRA = {"combustivel", "forma_amostra", "tamanho_amostra", "tamanho_queimador", "suporte"}
MAX_LEVELS_LINK = 8  # acima disso (texto livre, medidas contínuas) o cruzamento só produz ruído


def _levels(series: pl.Series, papel: Papel) -> pl.Series:
    """Nível de cada teste para cruzar variáveis. Números viram grupos naturais: um nível novo sempre que o
    valor salta mais de 10% (ex.: 757–773 mmHg → ≈1 atm; 2319 mmHg → ≈3,05 atm)."""
    if not (series.dtype.is_numeric() and series.dtype != pl.Boolean):
        return series.cast(pl.String)
    values = series.cast(pl.Float64) * papel.fator
    ordered = sorted(values.drop_nulls().unique().to_list())
    if len(ordered) <= MAX_LEVELS_LINK:  # poucos valores: são os níveis do desenho, ficam exatos
        return values.map_elements(_fmt, return_dtype=pl.String)
    groups, current = [], [ordered[0]]
    for v in ordered[1:]:
        if abs(v - current[-1]) > 0.1 * max(abs(current[-1]), 1e-9):
            groups.append(current)
            current = [v]
        else:
            current.append(v)
    groups.append(current)
    label = {}
    for g in groups:
        text = _fmt(g[0]) if _fmt(g[0]) == _fmt(g[-1]) else f"≈{_fmt(sum(g) / len(g))}"
        label.update(dict.fromkeys(g, text))
    return values.map_elements(lambda v: label.get(v), return_dtype=pl.String)


def vinculos(frame: pl.DataFrame, roles: dict[str, Papel], min_tests: int = 2) -> list[dict]:
    """Pares de condições que variaram juntas: algum nível de A só aparece com um nível de B, que no
    estudo varia. É o que impede dizer qual das duas causou uma diferença."""
    attrs = {p.atributo for p in roles.values()}
    skip = {"nitrogenio", "diluente"} if {"oxigenio", "helio"} & attrs else set()  # o resto da mistura de gás
    varied = []
    for column, papel in roles.items():
        if papel.atributo == "medicao" or papel.atributo in skip or column not in frame.columns:
            continue
        levels = _levels(frame[column], papel)
        if 1 < levels.drop_nulls().n_unique() <= MAX_LEVELS_LINK:
            varied.append((papel, levels))
    out = []
    for i, (pa, la) in enumerate(varied):
        for pb, lb in varied[i + 1 :]:
            pair_attrs = {pa.atributo, pb.atributo}
            if (
                frozenset(pair_attrs) in NAO_VINCULAR
                or pair_attrs <= DA_AMOSTRA
                or pa.atributo == pb.atributo
            ):
                continue
            pair = pl.DataFrame({"a": la, "b": lb}).drop_nulls()
            if pair["a"].n_unique() < 2 or pair["b"].n_unique() < 2:
                continue
            examples = []
            for first, second, p1, p2 in (("a", "b", pa, pb), ("b", "a", pb, pa)):
                grouped = pair.group_by(first).agg(
                    pl.len().alias("n"),
                    pl.col(second).n_unique().alias("k"),
                    pl.col(second).first().alias("so"),
                )
                for level, n, _k, only in grouped.filter(
                    (pl.col("n") >= min_tests) & (pl.col("k") == 1)
                ).iter_rows():
                    examples.append(
                        (n, f"com {_lower(p1.rotulo)} {level}, só {_lower(p2.rotulo)} {only} ({n} testes)")
                    )
            if examples:
                examples.sort(reverse=True)
                out.append({
                    "variavel_a": pa.rotulo, "variavel_b": pb.rotulo, "atributo_a": pa.atributo,
                    "atributo_b": pb.atributo, "testes": sum(n for n, _ in examples),
                    "exemplos": "; ".join(t for _, t in examples[:3]),
                    "descricao": f"{pa.rotulo} e {_lower(pb.rotulo)} não variaram de forma independente: "
                                 "o efeito de uma não se separa do da outra nesses testes.",
                })  # fmt: skip
    return sorted(out, key=lambda r: -r["testes"])


# estudos enviados antes do campo `atributo`: inferência simples pelo nome da coluna
PALAVRAS = [("pressao", "pressao"), ("pressure", "pressao"), ("oxigenio", "oxigenio"), ("o2", "oxigenio"),
            ("helio", "helio"), ("diluente", "diluente"), ("velocidade", "velocidade_fluxo"), ("fluxo", "ventilacao"),
            ("material", "combustivel"), ("combustivel", "combustivel"), ("fuel", "combustivel"),
            ("queimador", "tamanho_queimador"), ("burner", "tamanho_queimador"), ("geometria", "forma_amostra"),
            ("temperatura", "temperatura")]  # fmt: skip


PALAVRAS_GRANDEZA = [(("extincao",), "diametro_extincao"), (("extinction",), "diametro_extincao"),
                     (("taxa", "queima"), "taxa_queima"), (("burning", "rate"), "taxa_queima"),
                     (("tempo", "queima"), "tempo_queima"), (("burn", "time"), "tempo_queima")]  # fmt: skip


def _guess_quantity(name: str) -> str | None:
    parts = set(name.lower().split("_"))
    return next((q for words, q in PALAVRAS_GRANDEZA if set(words) <= parts), None)


def _guess(name: str) -> str | None:
    parts = name.lower().split("_")
    return next((attr for word, attr in PALAVRAS if word in parts), None)


def compute(
    tables: dict[str, pl.DataFrame],
    investigations: list[dict],
    submitted: pl.DataFrame | None,
    documented: dict[str, list[dict]] | None = None,
):
    """Ficha e vínculos de todos os estudos. `submitted` é o dicionário das colunas dos estudos enviados;
    `documented`, as fichas aprovadas a partir dos documentos (estudo → lista de fichas)."""
    rows, links = [], []
    for inv in investigations:
        inv_id = inv["id"]
        per_table: dict[str, dict[str, Papel]] = {}
        if inv.get("origem") == "envio" and submitted is not None and submitted.height:
            for col in submitted.filter(pl.col("investigacao") == inv_id).iter_rows(named=True):
                if col["natureza"] in ("MEDIDO", "SIMULADO", "DERIVADO"):
                    attr = "medicao"
                elif col["natureza"] == "CONDICAO":
                    attr = col.get("atributo") or _guess(col["coluna"]) or "outra_condicao"
                else:
                    continue
                description = col.get("descricao") or ""
                label = (
                    description
                    if 0 < len(description) <= 60
                    else col["coluna"].replace("_", " ").capitalize()
                )
                notes = [description] if len(description) > 60 else []
                factor, unit = 1.0, col.get("unidade") if attr == "medicao" else None
                if attr != "medicao" and ATRIBUTOS[attr][3] == "numero":
                    found = conversion(attr, col.get("unidade"))
                    if found is None:  # fica na unidade da fonte, e o hub não a mistura com as outras
                        unit = col.get("unidade") or "não informada"
                        notes.append(f"Unidade '{unit}' não convertida para {ATRIBUTOS[attr][2]}.")
                    else:
                        factor = found
                quantity = (
                    (col.get("grandeza") or _guess_quantity(col["coluna"])) if attr == "medicao" else None
                )
                per_table.setdefault(col["tabela"], {})[col["coluna"]] = Papel(
                    attr, label, factor, unidade=unit, natureza=col["natureza"], nota=" ".join(notes) or None,
                    grandeza=quantity,
                )  # fmt: skip
        else:
            prefix = inv["tabela"].split("_")[0] + "_"
            per_table = {t: roles for t, roles in PAPEIS.items() if t.startswith(prefix)}
        for table, roles in per_table.items():
            frame = tables.get(table)
            if frame is None:
                continue
            for column, papel in roles.items():
                if (row := describe(frame, column, papel)) is not None:
                    rows.append({"investigacao": inv_id, "tabela": table, "origem": "dados",
                                 "evidencia": f"{table}.{column}{_factor_text(papel.fator)}",
                                 **row})  # fmt: skip
            for link in vinculos(frame, roles):
                links.append({"investigacao": inv_id, "tabela": table, **link})
        for attr, label, value, source in FIXOS.get(inv_id, []):
            section, _, unit, _ = ATRIBUTOS[attr]
            rows.append({"investigacao": inv_id, "tabela": None, "origem": source, "evidencia": source,
                         "secao": section, "atributo": attr, "rotulo": label, "coluna": None, "unidade": unit,
                         "natureza": "CONDICAO", "registros": None, "niveis": 1, "minimo": None, "maximo": None,
                         "valores": value, "lista": value, "nota": None, "grandeza": None,
                         "situacao": "fixo"})  # fmt: skip
        rows += _readme_conditions(tables, inv_id)
        for sheet in (documented or {}).get(inv_id, []):
            rows += document_rows(inv_id, sheet)
    sheet = pl.DataFrame(rows, infer_schema_length=None)
    if sheet.height:  # a ordem de PAPEIS (e da especificação) é a ordem de leitura na tela
        sheet = sheet.with_row_index("ordem")
    return sheet, pl.DataFrame(links, infer_schema_length=None)


def _readme_conditions(tables: dict[str, pl.DataFrame], inv_id: str) -> list[dict]:
    """PSI-117: o ReadMe diz as condições de cada tabela (combustível, D0, O2), que não estão nas colunas."""
    readme = tables.get("psi117_tabelas")
    if inv_id != "PSI-117" or readme is None:
        return []
    out = []
    # combustível e D0 já saem das colunas; o oxigênio de cada tabela só está no ReadMe
    for attr, column, label in (("oxigenio", "xo2_texto", "Oxigênio"),):
        values = [v for v in readme[column].drop_nulls().unique().sort().to_list() if v]
        numbers = [float(n) for v in values for n in re.findall(r"\d+(?:\.\d+)?", v)]
        section, _, unit, _ = ATRIBUTOS[attr]
        out.append({"investigacao": inv_id, "tabela": "psi117_tabelas", "origem": "ReadMe da investigação",
                    "evidencia": f"psi117_tabelas.{column}", "secao": section, "atributo": attr, "rotulo": label,
                    "coluna": column, "unidade": unit, "natureza": "CONDICAO", "registros": readme.height,
                    "niveis": len(values), "minimo": min(numbers, default=None), "maximo": max(numbers, default=None),
                    "valores": ", ".join(values), "lista": None, "grandeza": None,
                    "nota": "Por tabela da investigação, conforme o ReadMe.",
                    "situacao": "variou" if len(values) > 1 else "fixo"})  # fmt: skip
    return out


# --- itens que vêm dos documentos (aprovados na revisão) ------------------------------------------

TOLERANCIA = 0.02


def _evidence_text(evidence: dict) -> str:
    where = " ".join(
        x
        for x in (evidence.get("arquivo"), f"p. {evidence['pagina']}" if evidence.get("pagina") else "")
        if x
    )
    return f"{where}: “{evidence.get('trecho')}”" if evidence.get("trecho") else where


def document_rows(inv_id: str, sheet: dict) -> list[dict]:
    """Linhas da ficha para o objetivo, os sensores e as condições escritos nos documentos."""
    base = {"investigacao": inv_id, "tabela": None, "origem": "documento", "coluna": None, "natureza": "DOCUMENTO",
            "registros": None, "niveis": None, "minimo": None, "maximo": None, "lista": None, "grandeza": None,
            "situacao": "documento"}  # fmt: skip
    rows = []

    def note(item: dict) -> str | None:
        notes = (
            [] if item.get("conferido") else ["Trecho não encontrado no documento; confirmado na revisão."]
        )
        if item.get("planejado"):
            notes.append("O documento descreve o planejado (requisito), não necessariamente o que foi feito.")
        return " ".join(notes) or None

    if goal := sheet.get("objetivo"):
        rows.append(base | {"secao": "objetivo", "atributo": "objetivo", "rotulo": "Objetivo", "unidade": None,
                            "valores": goal.get("texto"), "evidencia": _evidence_text(goal.get("evidencia") or {}),
                            "nota": note(goal)})  # fmt: skip
    for sensor in sheet.get("sensores") or []:
        rows.append(base | {"secao": "sensor", "atributo": "sensor", "rotulo": sensor.get("nome"), "unidade": None,
                            "valores": sensor.get("mede"), "grandeza": sensor.get("grandeza"),
                            "evidencia": _evidence_text(sensor.get("evidencia") or {}),
                            "nota": note(sensor)})  # fmt: skip
    for cond in sheet.get("condicoes") or []:
        attr = cond.get("atributo")
        if attr not in ATRIBUTOS:
            continue
        section, label, common, kind = ATRIBUTOS[attr]
        row = base | {"secao": section, "atributo": attr, "rotulo": label, "unidade": cond.get("unidade"),
                      "valores": cond.get("valor"), "evidencia": _evidence_text(cond.get("evidencia") or {}),
                      "nota": note(cond)}  # fmt: skip
        low, high = cond.get("minimo"), cond.get("maximo")
        if kind == "numero" and (low is not None or high is not None):
            factor = conversion(attr, cond.get("unidade"))
            if factor is not None:  # na unidade comum; um lado vazio é faixa aberta ("≥ 21%"), não valor fixo
                row |= {"minimo": None if low is None else low * factor,
                        "maximo": None if high is None else high * factor, "unidade": common}  # fmt: skip
            else:
                row["nota"] = " ".join(
                    x for x in (row["nota"], f"Unidade '{cond.get('unidade')}' não convertida.") if x
                )
        rows.append(row)
    return rows


def mark_divergences(sheet: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Condição do documento cuja faixa não cobre a dos dados: a ficha mostra os dois e registra um alerta.
    Os dados não são corrigidos pelo documento, nem o contrário."""
    schema = dict.fromkeys(
        ("investigacao", "teste_id", "campo", "valor_original", "tipo", "detalhe"), pl.String
    )
    if not sheet.height or "origem" not in sheet.columns:
        return sheet, pl.DataFrame(schema=schema)
    data = sheet.filter((pl.col("origem") == "dados") & pl.col("minimo").is_not_null())
    alerts, updates = [], {}
    written = sheet.filter(
        (pl.col("origem") == "documento") & (pl.col("minimo").is_not_null() | pl.col("maximo").is_not_null())
    )
    for row in written.iter_rows(named=True):
        same = data.filter((pl.col("investigacao") == row["investigacao"]) & (pl.col("atributo") == row["atributo"])
                           & (pl.col("unidade") == row["unidade"]))  # fmt: skip
        if not same.height:
            continue
        low, high = same["minimo"].min(), same["maximo"].max()
        doc_low = (
            row["minimo"] if row["minimo"] is not None else float("-inf")
        )  # faixa aberta: só um lado vale
        doc_high = row["maximo"] if row["maximo"] is not None else float("inf")
        slack = TOLERANCIA * max(abs(v) for v in (row["minimo"], row["maximo"], 1e-9) if v is not None)
        if low >= doc_low - slack and high <= doc_high + slack:
            continue
        seen = f"{_fmt(low)}" if low == high else f"{_fmt(low)} – {_fmt(high)}"
        if row["maximo"] is None:
            said = f"≥ {_fmt(row['minimo'])}"
        elif row["minimo"] is None:
            said = f"≤ {_fmt(row['maximo'])}"
        elif row["minimo"] == row["maximo"]:
            said = _fmt(row["minimo"])
        else:
            said = f"{_fmt(row['minimo'])} – {_fmt(row['maximo'])}"
        text = (
            f"O documento diz {said} {row['unidade']}; os dados carregados mostram {seen} {row['unidade']}."
        )
        updates[row["ordem"]] = text
        alerts.append({"investigacao": row["investigacao"], "teste_id": None, "campo": row["atributo"],
                       "valor_original": row["valores"], "tipo": "ficha_divergente",
                       "detalhe": text + " A ficha mostra os dois; vale o que os dados mostram."})  # fmt: skip
    if updates:
        sheet = sheet.with_columns(
            situacao=pl.when(pl.col("ordem").is_in(list(updates)))
            .then(pl.lit("divergente"))
            .otherwise("situacao"),
            nota=pl.col("ordem").replace_strict(updates, default=pl.col("nota"), return_dtype=pl.String),
        )
    return sheet, pl.DataFrame(alerts, schema=schema)
