"""Correspondência entre investigações que compartilham dados.

O PSI-117 (modelo, solo) usa como "medição" ensaios de voo feitos no aparelho do FLEX, o mesmo onde
rodou o CFI (PSI-39). Esta tabela diz, ponto a ponto, quais medições do PSI-117 são ensaios do CFI.
Sem isso, comparar os dois pareceria uma validação independente, e não é.
"""

from __future__ import annotations

import polars as pl

from ..datasets.common import Alerts

TOLERANCE_MM = 0.005  # metade do último dígito publicado nas tabelas do PSI-117 (duas casas)


def psi117_cfi(tables: dict[str, pl.DataFrame]) -> tuple[pl.DataFrame | None, pl.DataFrame]:
    alerts = Alerts("PSI-117")
    cfi = tables.get("cfi_ensaios")
    if cfi is None:
        return None, alerts.frame()
    c12 = cfi.filter((pl.col("combustivel") == "n-dodecano") & (pl.col("diluente") == "Nitrogênio"))
    rows = []

    # Tabela de 1 atm: cada ponto traz D0 e os dois diâmetros, então dá para achar o ensaio exato.
    one_atm = tables.get("psi117_extincao_1atm")
    if one_atm is not None:
        measured = one_atm.filter((pl.col("combustivel") == "n-dodecano") & (pl.col("serie") == "Medição"))
        for d0, hot, cool in measured.select("d0_mm", "dext_quente_mm", "dext_fria_mm").iter_rows():
            match = c12.filter(
                ((pl.col("d0_mm") - d0).abs() < 1e-9) & ((pl.col("dext_quente_mm") - hot).abs() < 1e-9)
            )
            if match.is_empty():
                rows.append(
                    _row(
                        "extinção a 1 atm",
                        "Chama quente",
                        1.0,
                        d0,
                        hot,
                        None,
                        None,
                        "sem ensaio correspondente",
                    )
                )
                continue
            test = match.row(0, named=True)
            rows.append(_row("extinção a 1 atm", "Chama quente", 1.0, d0, hot, test["teste_id"],
                             test["dext_quente_mm"], "mesmo ensaio"))  # fmt: skip
            cfi_cool = test["dext_fria_mm"]
            same = (cfi_cool is None and (cool == 0 or test["dext_fria_zero_na_fonte"])) or (
                cfi_cool is not None and abs(cfi_cool - cool) <= TOLERANCE_MM
            )
            situation = "mesmo ensaio" if same else "mesmo ensaio, valor diferente"
            rows.append(
                _row("extinção a 1 atm", "Chama fria", 1.0, d0, cool, test["teste_id"], cfi_cool, situation)
            )
            if not same:
                alerts.add(f"CFI {test['teste_id']}", "dext_fria_mm", f"PSI-117: {cool:g} · CFI: {cfi_cool}",
                           "divergencia_entre_fontes",
                           f"O mesmo ensaio (D0 {d0:g} mm) tem diâmetro de extinção da chama fria diferente "
                           "no PSI-117 e no CFI.")  # fmt: skip

    # Tabela por pressão: só o valor e a pressão. Procura ensaios do CFI com o mesmo valor.
    by_pressure = tables.get("psi117_extincao")
    if by_pressure is not None:
        measured = by_pressure.filter(pl.col("serie") == "Medição")
        for flame, pressure, value in measured.select(
            "tipo_chama", "pressao_atm", "diametro_extincao_mm"
        ).iter_rows():
            column = "dext_quente_mm" if flame == "Chama quente" else "dext_fria_mm"
            match = c12.filter(
                (pl.col("pressao_atm") == pressure) & ((pl.col(column) - value).abs() <= TOLERANCE_MM)
            )
            if match.is_empty():
                rows.append(_row("extinção por pressão", flame, pressure, None, value, None, None,
                                 "sem ensaio individual igual (pode ser média ou outro tratamento)"))  # fmt: skip
            for test in match.iter_rows(named=True):
                rows.append(_row("extinção por pressão", flame, pressure, test["d0_mm"], value, test["teste_id"],
                                 test[column], "mesmo valor de um ensaio"))  # fmt: skip
    return (pl.DataFrame(rows, infer_schema_length=None) if rows else None), alerts.frame()


def _row(table, flame, pressure, d0, value, test_id, cfi_value, situation) -> dict:
    return {
        "tabela_psi117": table,
        "tipo_chama": flame,
        "pressao_atm": pressure,
        "d0_mm": d0,
        "valor_psi117_mm": value,
        "cfi_teste_id": test_id,
        "valor_cfi_mm": cfi_value,
        "situacao": situation,
    }
