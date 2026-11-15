"""Revisão da ficha proposta a partir dos documentos (usada no envio e em "Adicionar documentos")."""

from __future__ import annotations

import math

import pandas as pd
import streamlit as st

from .ingest.ficha import ATRIBUTOS, GRANDEZAS
from .studies import ficha_docs
from .ui import evidence_label, md_escape

FLAGS = {"planejado"}  # caixas de marcar: vazio é falso, e sozinhas não fazem uma linha
PLANNED_COLUMN = st.column_config.CheckboxColumn(
    "Só o plano",
    help="O documento descreve o planejado (requisito), não necessariamente o que foi feito. "
    "Fica anotado na ficha.",
)


def _check_label(item: dict) -> str:
    return "✓ trecho encontrado" if item.get("conferido") else "✗ trecho não encontrado"


def _attr_label(key: str) -> str:
    _, label, unit, _ = ATRIBUTOS[key]
    return f"{label} ({unit})" if unit else label


def _quantity_label(key: str) -> str:
    return GRANDEZAS[key][0] if key else "—"


def _blank(value: object) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value)) or str(value).strip() == ""


def _merge(
    old: list[dict], edited: pd.DataFrame, fields: list[str], numeric: tuple[str, ...] = ()
) -> list[dict]:
    """Linhas editadas → itens. Linhas novas não têm evidência (e a validação acusa); removidas saem."""
    out = []
    for row in edited.to_dict("records"):
        index = row.get("_i")
        item = dict(old[int(index)]) if not _blank(index) and int(index) < len(old) else {"evidencia": {}}
        for name in fields:
            value = row.get(name)
            if name in FLAGS:
                item[name] = not _blank(value) and bool(value)
            else:
                item[name] = None if _blank(value) else (float(value) if name in numeric else value)
        item["confirmado"] = bool(row.get("confirmado"))
        if any(not _blank(item.get(name)) for name in fields if name not in FLAGS):  # linha vazia não conta
            out.append(item)
    return out


def review(base: dict | None, key: str) -> dict:
    """Mostra a ficha para conferir e devolve a versão revisada (o que a pessoa editou, removeu e confirmou).

    `base` precisa ser a mesma em toda reexecução da página: as edições ficam no estado dos widgets e são
    aplicadas sobre ela (se a base mudasse, uma linha apagada seria apagada de novo)."""
    sheet = dict(base or {})
    waiting = ficha_docs.pending(sheet)
    st.caption(
        "Lida dos documentos. O código procurou cada trecho citado na página indicada: os encontrados já vêm "
        "marcados em *Entra na ficha*; os não encontrados só entram se você marcar. Só o marcado é gravado."
        + (f" **{waiting} desmarcado(s): não vão ser gravados.**" if waiting else "")
    )

    goal = sheet.get("objetivo")
    if goal:
        text = st.text_area("Objetivo experimental", goal.get("texto", ""), key=f"{key}:objetivo")
        st.caption(
            f"{_check_label(goal)} · {md_escape(evidence_label({'tipo': 'documento', **goal['evidencia']}))}"
        )
        confirmed = st.checkbox(
            "O objetivo entra na ficha", value=bool(goal.get("confirmado")), key=f"{key}:obj_ok"
        )
        sheet["objetivo"] = {**goal, "texto": text, "confirmado": confirmed} if text.strip() else None

    conditions = sheet.get("condicoes") or []
    st.markdown(f"**Condições escritas nos documentos ({len(conditions)})**")
    edited = st.data_editor(
        pd.DataFrame(
            [{"_i": i, "confirmado": bool(c.get("confirmado")), "conferencia": _check_label(c),
              "evidencia": evidence_label({"tipo": "documento", **(c.get("evidencia") or {})}),
              "atributo": c.get("atributo"), "valor": c.get("valor"), "minimo": c.get("minimo"),
              "maximo": c.get("maximo"), "unidade": c.get("unidade"), "planejado": bool(c.get("planejado"))}
             for i, c in enumerate(conditions)],
            columns=["_i", "confirmado", "conferencia", "evidencia", "atributo", "valor", "minimo", "maximo",
                     "unidade", "planejado"],
        ),
        num_rows="dynamic", hide_index=True, width="stretch", key=f"{key}:condicoes",
        column_config={
            "_i": None,
            "confirmado": st.column_config.CheckboxColumn("Entra na ficha"),
            "conferencia": st.column_config.TextColumn("Conferência", disabled=True),
            "evidencia": st.column_config.TextColumn("De onde saiu", disabled=True, width="large"),
            "atributo": st.column_config.SelectboxColumn("Atributo", options=ficha_docs.CONDITION_ATTRS,
                                                         format_func=_attr_label, required=True),
            "valor": st.column_config.TextColumn("Como o documento diz"),
            "minimo": st.column_config.NumberColumn("Mínimo"),
            "maximo": st.column_config.NumberColumn("Máximo"),
            "unidade": st.column_config.TextColumn("Unidade"),
            "planejado": PLANNED_COLUMN,
        },
    )  # fmt: skip
    sheet["condicoes"] = _merge(conditions, edited, ["atributo", "valor", "minimo", "maximo", "unidade", "planejado"],
                                numeric=("minimo", "maximo"))  # fmt: skip

    sensors = sheet.get("sensores") or []
    st.markdown(f"**Sensores e medições ({len(sensors)})**")
    edited = st.data_editor(
        pd.DataFrame(
            [{"_i": i, "confirmado": bool(s.get("confirmado")), "conferencia": _check_label(s),
              "evidencia": evidence_label({"tipo": "documento", **(s.get("evidencia") or {})}),
              "nome": s.get("nome"), "mede": s.get("mede"), "grandeza": s.get("grandeza") or "",
              "planejado": bool(s.get("planejado"))}
             for i, s in enumerate(sensors)],
            columns=["_i", "confirmado", "conferencia", "evidencia", "nome", "mede", "grandeza", "planejado"],
        ),
        num_rows="dynamic", hide_index=True, width="stretch", key=f"{key}:sensores",
        column_config={
            "_i": None,
            "confirmado": st.column_config.CheckboxColumn("Entra na ficha"),
            "conferencia": st.column_config.TextColumn("Conferência", disabled=True),
            "evidencia": st.column_config.TextColumn("De onde saiu", disabled=True, width="large"),
            "nome": st.column_config.TextColumn("Sensor"),
            "mede": st.column_config.TextColumn("O que mede", width="medium"),
            "grandeza": st.column_config.SelectboxColumn("Grandeza", options=["", *GRANDEZAS],
                                                         format_func=_quantity_label),
            "planejado": PLANNED_COLUMN,
        },
    )  # fmt: skip
    sheet["sensores"] = _merge(sensors, edited, ["nome", "mede", "grandeza", "planejado"])
    return sheet
