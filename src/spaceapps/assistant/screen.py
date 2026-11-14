"""O estado da tela que o assistente consegue ver."""

from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl


@dataclass
class Screen:
    """O que uma página mostra agora. Cada página monta um e entrega ao chat.

    `dados` são as linhas já filtradas: é delas que saem as respostas sobre "o que está na tela".
    """

    pagina: str  # chave em tools.PAGE_GROUPS
    titulo: str
    investigacao: str | None = None  # PSI-69, PSI-25, PSI-117 ou None (visão geral, explorar)
    filtros: dict[str, object] = field(default_factory=dict)
    graficos: list[str] = field(default_factory=list)
    dados: pl.DataFrame | None = None
    tabela_banco: str | None = None  # tabela de onde `dados` veio, para o dicionário

    def resumo(self) -> str:
        """Texto curto que vai no prompt de sistema: dá ao modelo o que está visível sem gastar ferramenta."""
        lines = [f"Página: {self.titulo}"]
        if self.investigacao:
            lines.append(f"Investigação desta página: {self.investigacao}")
        if self.filtros:
            lines.append("Filtros ativos: " + "; ".join(f"{k} = {_fmt(v)}" for k, v in self.filtros.items()))
        for chart in self.graficos:
            lines.append(f"Gráfico visível: {chart}")
        if self.dados is not None:
            lines.append(f"Linhas na tela após os filtros: {self.dados.height}")
            lines.append("Colunas: " + ", ".join(self.dados.columns))
        return "\n".join(lines)


def _fmt(value: object) -> str:
    if isinstance(value, list | tuple):
        return ", ".join(_fmt(v) for v in value) or "(nenhum)"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)
