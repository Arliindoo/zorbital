"""Interpretação dos dados com Claude."""

from __future__ import annotations

import os
from collections.abc import Iterator

import anthropic
import polars as pl

DEFAULT_MODEL = "claude-opus-5-5"
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Tabelas maiores que isso não vão inteiras para o modelo: vai só o resumo por
# série, e a interface avisa (ver `build_context`).
MAX_TABLE_ROWS = 400

SYSTEM = """\
Você é analista de dados dentro de um dashboard interativo. A pessoa está olhando \
um gráfico que compara séries, e você recebe exatamente os dados que alimentam esse gráfico.

Responda em português, direto ao ponto: comece pelo achado principal, depois o que o sustenta.
Baseie cada afirmação nos números recebidos e cite-os. Separe o que os dados mostram \
do que é hipótese sua sobre a causa — os dados sozinhos raramente provam causa.
Se a pergunta não puder ser respondida com o que foi enviado, diga o que falta."""


def build_context(
    df: pl.DataFrame,
    table: pl.DataFrame,
    summary: pl.DataFrame,
    *,
    by: str,
    x: str,
    measure: str,
    agg: str,
) -> tuple[str, bool]:
    """Monta o texto enviado ao modelo. Devolve também se a tabela foi inteira."""
    full = table.height <= MAX_TABLE_ROWS
    parts = [
        f"Conjunto de dados: {df.height} linhas, {df.width} colunas.",
        "Colunas: " + ", ".join(f"{name} ({dtype})" for name, dtype in df.schema.items()),
        f"Recorte no gráfico: {agg} de `{measure}` por `{x}`, uma série para cada valor de `{by}`.",
        f"Resumo por série (CSV):\n{summary.write_csv()}",
    ]
    if full:
        parts.append(f"Tabela completa do gráfico (CSV):\n{table.write_csv()}")
    else:
        parts.append(
            f"A tabela do gráfico tem {table.height} linhas e não foi enviada; "
            "você tem apenas o resumo por série acima."
        )
    return "\n\n".join(parts), full


def interpret(context: str, question: str) -> Iterator[str]:
    """Faz a pergunta ao Claude e devolve a resposta em pedaços, conforme chega."""
    client = anthropic.Anthropic()  # credencial vem do ambiente (ANTHROPIC_API_KEY ou `ant auth login`)
    with client.beta.messages.stream(
        model=os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL),
        max_tokens=64000,
        system=SYSTEM,
        output_config={"effort": "medium"},
        # Se o modelo recusar por política, a própria API refaz o pedido num modelo de reserva.
        betas=[FALLBACK_BETA],
        fallbacks="default",
        messages=[{"role": "user", "content": f"{context}\n\nPergunta: {question}"}],
    ) as stream:
        yield from stream.text_stream
        final = stream.get_final_message()

    if final.stop_reason == "refusal":
        yield "\n\n_O modelo recusou responder a este pedido._"
    elif final.stop_reason == "max_tokens":
        yield "\n\n_A resposta foi cortada por atingir o limite de tamanho._"
