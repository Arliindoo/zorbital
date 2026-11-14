"""PSI-69 FLEX: queima de gotas de combustível líquido na ISS."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from .common import Alerts, numeric_or_alert, read_csv_rows, to_date, to_text

INVESTIGACAO = "PSI-69"
COLUMNS = 15
OUTCOMES = {"Extinction": "Extinção", "Completion": "Queima completa", "Disruption": "Ruptura da gota"}


def load(path: Path) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Lê o CSV no formato original do FLEX (15 colunas). Devolve ensaios e alertas."""
    rows = read_csv_rows(path)
    header, body = rows[0], rows[1:]
    if len(header) != COLUMNS:
        raise ValueError(f"{path.name}: esperadas {COLUMNS} colunas do FLEX, há {len(header)}.")

    alerts, records = Alerts(INVESTIGACAO), []
    for line, x in enumerate(body, start=2):
        if len(x) != COLUMNS:
            alerts.add(f"linha {line}", "(linha)", ",".join(x), "linha_malformada", "Linha descartada.")
            continue
        test = x[0].strip()

        def num(campo: str, v: str, test: str = test) -> float | None:
            return numeric_or_alert(alerts, test, campo, v)

        o2 = num("oxigenio_fracao", x[6])
        if o2 is not None and not 0 <= o2 <= 1:
            alerts.add(test, "oxigenio_fracao", x[6], "fora_da_faixa", "Fração molar fora de 0–1.")
        outcome = x[14].strip()
        if outcome not in OUTCOMES:
            alerts.add(
                test, "desfecho", outcome, "categoria_desconhecida", "Desfecho fora dos três esperados."
            )
        for campo, value in (("diametro_inicial_mm", x[10]), ("diametro_extincao_visivel_mm", x[11])):
            if to_text(value) in (None, "–", "-"):
                alerts.add(test, campo, value, "valor_ausente", "Célula vazia na fonte.")

        records.append(
            {
                "teste_id": test,
                "identificador": to_text(x[1]),
                "data": to_date(x[2]),
                "hora_gmt": to_text(x[3]),
                "combustivel": to_text(x[4]),
                "pressao_mmhg": num("pressao_mmhg", x[5]),
                "oxigenio_fracao": o2,
                "nitrogenio_fracao": num("nitrogenio_fracao", x[7]),
                # O cabeçalho da fonte diz só "CO": o subscrito do gás se perdeu na exportação.
                # Não renomear para CO2 sem confirmar no relatório.
                "gas_co_rotulo_ambiguo_fracao": num("gas_co_rotulo_ambiguo_fracao", x[8]),
                "helio_fracao": num("helio_fracao", x[9]),
                "diametro_inicial_mm": num("diametro_inicial_mm", x[10]),
                "diametro_extincao_visivel_mm": num("diametro_extincao_visivel_mm", x[11]),
                # Rótulo da fonte: "Burning rate; mm". A unidade precisa ser conferida.
                "taxa_queima_valor": num("taxa_queima_valor", x[12]),
                "tempo_queima_s": num("tempo_queima_s", x[13]),
                "desfecho_original": outcome,
                "desfecho": OUTCOMES.get(outcome, outcome),
            }
        )
    return pl.DataFrame(records, infer_schema_length=None), alerts.frame()
