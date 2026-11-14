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
    investigacao: str | None = None  # a investigação da página, ou None (visão geral, explorar)
    escopo: list[str] | None = None  # páginas com mais de uma investigação (comparação)
    filtros: dict[str, object] = field(default_factory=dict)
    graficos: list[str] = field(default_factory=list)
    dados: pl.DataFrame | None = None
    tabela_banco: str | None = None  # tabela de onde `dados` veio, para o dicionário

    def allowed(self) -> list[str] | None:
        """Investigações que as ferramentas de qualidade podem consultar nesta página (None = todas)."""
        return self.escopo or ([self.investigacao] if self.investigacao else None)

    def resumo(self) -> str:
        """Texto curto que vai no prompt de sistema: dá ao modelo o que está visível sem gastar ferramenta."""
        lines = [f"Página: {self.titulo}"]
        if self.investigacao:
            lines.append(f"Investigação desta página: {self.investigacao}")
        if self.escopo:
            lines.append("Investigações desta página: " + ", ".join(self.escopo))
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
