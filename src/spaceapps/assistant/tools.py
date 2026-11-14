"""Ferramentas do assistente, organizadas em grupos, e os grupos que cada página liga.

Regras de escopo, garantidas aqui e não só no prompt:
- Só existem consultas prontas, com colunas de uma lista fechada. Não há SQL livre nem web.
- Nas páginas de investigação, as ferramentas de qualidade só respondem sobre aquela investigação.
- Nenhuma ferramenta junta investigações diferentes: elas medem coisas que não se comparam.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass

import polars as pl

from .. import db
from . import dictionary
from .screen import Screen

MAX_ROWS = 50
MAX_RESULT_CHARS = 12_000


@dataclass(frozen=True)
class Tool:
    name: str
    group: str
    description: str
    parameters: dict
    run: Callable[..., object]

    def schema(self) -> dict:
        return {
            "type": "function",
            "function": {"name": self.name, "description": self.description, "parameters": self.parameters},
        }


class ToolError(Exception):
    """Erro que volta para o modelo como resultado da ferramenta, para ele se corrigir."""


# --- Grupos e páginas ---------------------------------------------------------------------------

GROUPS = {
    "tela": "O que está na tela agora: filtros, gráficos e as linhas filtradas.",
    "flex": "Consultas na tabela do FLEX (gotas de combustível líquido).",
    "bass": "Consultas na tabela do BASS-II (materiais sólidos).",
    "psi117": "Comparação entre medição e modelo do PSI-117.",
    "qualidade": "Alertas de qualidade, origem dos dados e o que não concluir.",
    "catalogo": "As três investigações e os arquivos de dados/.",
    "dicionario": "Significado de colunas, unidades, categorias e tipos de alerta.",
}

PAGE_GROUPS = {
    "overview": ["catalogo", "qualidade", "dicionario"],
    "flex": ["tela", "flex", "qualidade", "dicionario"],
    "bass": ["tela", "bass", "qualidade", "dicionario"],
    "psi117": ["tela", "psi117", "qualidade", "dicionario"],
    "explore": ["tela", "dicionario"],
}

INVESTIGATIONS = ["PSI-69", "PSI-25", "PSI-117"]


def tools_for(page: str) -> list[Tool]:
    groups = PAGE_GROUPS[page]
    return [t for t in TOOLS.values() if t.group in groups]


def execute(name: str, raw_args: str, screen: Screen) -> str:
    """Roda uma ferramenta pedida pelo modelo e devolve o resultado em JSON (sempre texto)."""
    tool = TOOLS.get(name)
    try:
        if tool is None or tool not in tools_for(screen.pagina):
            raise ToolError(f"A ferramenta '{name}' não está disponível nesta página.")
        try:
            args = json.loads(raw_args or "{}")
        except json.JSONDecodeError as error:
            raise ToolError(f"Argumentos não são JSON válido: {error}") from error
        if not isinstance(args, dict):
            raise ToolError("Os argumentos precisam ser um objeto JSON.")
        allowed = set(tool.parameters.get("properties", {}))
        if unknown := set(args) - allowed:
            raise ToolError(f"Parâmetros desconhecidos: {sorted(unknown)}. Aceitos: {sorted(allowed)}.")
        result = tool.run(screen, **args)
    except ToolError as error:
        result = {"erro": str(error)}
    text = json.dumps(result, ensure_ascii=False, default=str)
    if len(text) > MAX_RESULT_CHARS:
        text = text[:MAX_RESULT_CHARS] + ' …"[resultado cortado: peça menos linhas ou colunas]"'
    return text


# --- Auxiliares ---------------------------------------------------------------------------------


def _rows(frame: pl.DataFrame) -> list[dict]:
    return frame.to_dicts()


def _require_screen_data(screen: Screen) -> pl.DataFrame:
    if screen.dados is None:
        raise ToolError("Esta página não tem uma tabela de dados na tela.")
    return screen.dados


def _column(frame: pl.DataFrame, column: str) -> str:
    if column not in frame.columns:
        raise ToolError(f"Coluna '{column}' não existe na tela. Colunas: {frame.columns}.")
    return column


def _scoped_investigation(screen: Screen, requested: str | None) -> str | None:
    """Na página de uma investigação, só ela. Na visão geral, qualquer uma (ou todas, com None)."""
    if screen.investigacao:
        if requested and requested != screen.investigacao:
            raise ToolError(
                f"Esta página é da investigação {screen.investigacao}; para {requested}, abra a página dela."
            )
        return screen.investigacao
    if requested and requested not in INVESTIGATIONS:
        raise ToolError(f"Investigação desconhecida: {requested}. Opções: {INVESTIGATIONS}.")
    return requested


def _stats(series: pl.Series) -> dict:
    values = series.drop_nulls()
    base = {"coluna": series.name, "linhas": series.len(), "vazios": series.null_count()}
    if series.dtype.is_numeric() and not values.is_empty():
        return base | {
            "minimo": values.min(),
            "maximo": values.max(),
            "media": round(values.mean(), 4),
            "mediana": values.median(),
            "desvio_padrao": round(values.std(), 4) if values.len() > 1 else None,
        }
    counts = values.cast(pl.String).value_counts(sort=True).head(15)
    return base | {"distintos": values.n_unique(), "mais_frequentes": counts.rows()}


def _group(frame: pl.DataFrame, by: str, measure: str | None) -> list[dict]:
    aggs = [pl.len().alias("registros")]
    if measure:
        m = pl.col(measure)
        aggs += [
            m.count().alias(f"{measure}_com_valor"),
            m.mean().round(4).alias(f"{measure}_media"),
            m.median().alias(f"{measure}_mediana"),
            m.min().alias(f"{measure}_min"),
            m.max().alias(f"{measure}_max"),
        ]
    return _rows(frame.group_by(by).agg(aggs).sort("registros", descending=True))


def _source(screen: Screen, table: str, use_screen: bool) -> pl.DataFrame:
    """A tabela filtrada da tela, ou a tabela inteira do banco."""
    if use_screen and screen.dados is not None and screen.tabela_banco == table:
        return screen.dados
    return db.query(f"SELECT * FROM {table}")


# --- Grupo tela ---------------------------------------------------------------------------------


def tela_resumo(screen: Screen) -> dict:
    return {
        "pagina": screen.titulo,
        "investigacao": screen.investigacao,
        "filtros": screen.filtros,
        "graficos": screen.graficos,
        "linhas_na_tela": None if screen.dados is None else screen.dados.height,
        "colunas": None if screen.dados is None else screen.dados.columns,
    }


def tela_linhas(
    screen: Screen,
    colunas: list[str] | None = None,
    ordenar_por: str | None = None,
    decrescente: bool = False,
    limite: int = 20,
) -> dict:
    frame = _require_screen_data(screen)
    if colunas:
        frame = frame.select([_column(frame, c) for c in colunas])
    if ordenar_por:
        frame = frame.sort(_column(frame, ordenar_por), descending=decrescente, nulls_last=True)
    limit = max(1, min(int(limite), MAX_ROWS))
    return {
        "linhas_na_tela": frame.height,
        "mostradas": min(limit, frame.height),
        "linhas": _rows(frame.head(limit)),
    }


def tela_estatisticas(screen: Screen, coluna: str) -> dict:
    frame = _require_screen_data(screen)
    return _stats(frame[_column(frame, coluna)])


# --- Grupos flex e bass -------------------------------------------------------------------------


def _record_tool(table: str, inv: str) -> Callable[..., dict]:
    def run(screen: Screen, teste_id: str) -> dict:
        found = db.query(f"SELECT * FROM {table} WHERE teste_id = ?", [str(teste_id)])
        if found.is_empty():
            raise ToolError(f"Teste '{teste_id}' não existe em {table}.")
        alerts = db.query(
            "SELECT campo, valor_original, tipo, detalhe FROM alertas WHERE investigacao = ? AND teste_id = ?",
            [inv, str(teste_id)],
        )
        return {
            "registro": found.row(0, named=True),
            "alertas": _rows(alerts),
            "esta_na_tela": screen.dados is not None and str(teste_id) in set(screen.dados["teste_id"]),
        }

    return run


def _group_tool(table: str) -> Callable[..., dict]:
    def run(screen: Screen, por: str, medida: str | None = None, somente_tela: bool = True) -> dict:
        frame = _source(screen, table, somente_tela)
        return {
            "base": "linhas filtradas na tela"
            if somente_tela and screen.dados is not None
            else "tabela inteira",
            "registros_na_base": frame.height,
            "grupos": _group(frame, _column(frame, por), _column(frame, medida) if medida else None),
        }

    return run


def _group_params(groups: list[str], measures: list[str], what: str) -> dict:
    return {
        "type": "object",
        "properties": {
            "por": {"type": "string", "enum": groups, "description": "Coluna para agrupar."},
            "medida": {
                "type": "string",
                "enum": measures,
                "description": f"Medida a resumir em cada grupo ({what}).",
            },
            "somente_tela": {
                "type": "boolean",
                "description": "true (padrão): só as linhas filtradas na tela. false: a tabela inteira.",
            },
        },
        "required": ["por"],
    }


ID_PARAM = {
    "type": "object",
    "properties": {
        "teste_id": {"type": "string", "description": "Identificador do teste, como aparece na tabela."}
    },
    "required": ["teste_id"],
}

# --- Grupo psi117 -------------------------------------------------------------------------------

FLAMES = ["Chama fria", "Chama quente"]


def psi117_comparar(screen: Screen, tipo_chama: str | None = None, pressao_atm: float | None = None) -> dict:
    sql, params = "SELECT * FROM v_psi117_comparacao WHERE true", []
    if tipo_chama:
        sql, params = sql + " AND tipo_chama = ?", [*params, tipo_chama]
    if pressao_atm is not None:
        sql, params = sql + " AND pressao_atm = ?", [*params, float(pressao_atm)]
    rows = db.query(sql, params)
    if rows.is_empty():
        raise ToolError("Nenhum ponto com esses critérios. Pressões disponíveis: 0.5, 0.75, 1, 1.25, 3 atm.")
    return {
        "nota": "medido_mm é média quando n_medicoes > 1. A faixa de incerteza só existe para a chama fria.",
        "linhas": _rows(rows),
    }


def psi117_pontos(screen: Screen, tipo_chama: str | None = None, serie: str | None = None) -> dict:
    sql, params = "SELECT * EXCLUDE (fonte_arquivo) FROM psi117_extincao WHERE true", []
    if tipo_chama:
        sql, params = sql + " AND tipo_chama = ?", [*params, tipo_chama]
    if serie:
        sql, params = sql + " AND serie = ?", [*params, serie]
    return {"linhas": _rows(db.query(sql + " ORDER BY tipo_chama, serie, pressao_atm", params))}


# --- Grupo qualidade ----------------------------------------------------------------------------


def alertas(
    screen: Screen, investigacao: str | None = None, teste_id: str | None = None, tipo: str | None = None
) -> dict:
    inv = _scoped_investigation(screen, investigacao)
    sql, params = "SELECT * FROM alertas WHERE true", []
    for column, value in (("investigacao", inv), ("teste_id", teste_id), ("tipo", tipo)):
        if value:
            sql, params = sql + f" AND {column} = ?", [*params, str(value)]
    rows = db.query(sql + " ORDER BY investigacao, tipo, teste_id", params)
    return {
        "total": rows.height,
        "por_tipo": _rows(rows.group_by("tipo").len("ocorrencias").sort("ocorrencias", descending=True)),
        "alertas": _rows(rows.head(MAX_ROWS)),
        "significado_dos_tipos": {
            t: dictionary.ALERTS[t] for t in set(rows["tipo"]) if t in dictionary.ALERTS
        },
    }


def fonte_dos_dados(screen: Screen, investigacao: str | None = None) -> dict:
    inv = _scoped_investigation(screen, investigacao)
    where, params = ("WHERE investigacao = ?", [inv]) if inv else ("", [])
    files = db.query(
        f"SELECT caminho, papel, status, motivo, linhas_carregadas, git_blob_sha1 FROM fontes {where} ORDER BY status",
        params,
    )
    loaded = db.query(
        "SELECT id, fonte_carregada FROM investigacoes" + (" WHERE id = ?" if inv else ""), params
    )
    return {
        "fonte_carregada": _rows(loaded),
        "arquivos": _rows(files),
        "proveniencia": "Cópias públicas de terceiros (GitHub) das tabelas do NASA PSI; conferir com o PSI.",
    }


def cautelas(screen: Screen, investigacao: str | None = None) -> dict:
    inv = _scoped_investigation(screen, investigacao)
    rows = db.query(
        "SELECT id, nome, pergunta, cautelas, url_nasa, relatorio, doi FROM investigacoes"
        + (" WHERE id = ?" if inv else ""),
        [inv] if inv else [],
    )
    return {"investigacoes": _rows(rows), "cautela_geral": db.meta()["geral"]}


INV_PARAM = {
    "type": "string",
    "enum": INVESTIGATIONS,
    "description": "PSI-69 (FLEX), PSI-25 (BASS-II) ou PSI-117. Nas páginas de investigação, só a da página.",
}

# --- Grupo catalogo -----------------------------------------------------------------------------


def listar_investigacoes(screen: Screen) -> dict:
    rows = db.query(
        """SELECT i.id, i.nome, i.categoria, i.ambiente, i.tipo_evidencia, i.pergunta, i.fonte_carregada,
                  coalesce(a.n, 0) AS alertas
           FROM investigacoes i LEFT JOIN (SELECT investigacao, count(*) n FROM alertas GROUP BY 1) a
           ON a.investigacao = i.id"""
    )
    counts = {
        "PSI-69": db.query("SELECT count(*) FROM flex_ensaios").item(),
        "PSI-25": db.query("SELECT count(*) FROM bass_ensaios").item(),
        "PSI-117": db.query("SELECT count(*) FROM psi117_extincao").item(),
    }
    return {"investigacoes": [r | {"registros": counts[r["id"]]} for r in _rows(rows)]}


def inventario_arquivos(screen: Screen, status: str | None = None) -> dict:
    sql, params = (
        "SELECT caminho, investigacao, papel, status, motivo, linhas_carregadas, duplicata_de FROM fontes",
        [],
    )
    if status:
        sql, params = sql + " WHERE status = ?", [status]
    rows = db.query(sql + " ORDER BY status, caminho", params)
    return {"total": rows.height, "arquivos": _rows(rows)}


STATUSES = ["Carregado", "Não carregado", "Duplicata exata", "Documentação", "Não reconhecido"]

# --- Grupo dicionario ---------------------------------------------------------------------------


def dicionario(screen: Screen, termo: str, tabela: str | None = None) -> dict:
    return dictionary.lookup(termo, tabela or screen.tabela_banco)


# --- Registro -----------------------------------------------------------------------------------

FLEX_GROUPS = ["desfecho", "oxigenio_fracao", "pressao_mmhg", "combustivel", "helio_fracao"]
FLEX_MEASURES = [
    "diametro_inicial_mm",
    "diametro_extincao_visivel_mm",
    "tempo_queima_s",
    "taxa_queima_valor",
    "oxigenio_fracao",
    "pressao_mmhg",
]
BASS_GROUPS = [
    "material_categoria",
    "geometria",
    "pesquisador",
    "cor",
    "faces_queimando",
    "ajustes_durante_teste",
    "restritor_fluxo",
]
BASS_MEASURES = [
    "o2_inicial_pct",
    "o2_final_pct",
    "delta_o2_pp",
    "co2_inicial_pct",
    "co2_final_pct",
    "delta_co2_pp",
    "co_inicial_ppm",
    "co_final_ppm",
    "delta_co_ppm",
    "espessura_mm",
    "diametro_mm",
    "quadros_total",
]

_ALL = [
    Tool(
        "tela_resumo",
        "tela",
        "Filtros ativos, gráficos visíveis e quantas linhas estão na tela.",
        {"type": "object", "properties": {}},
        tela_resumo,
    ),
    Tool(
        "tela_linhas",
        "tela",
        f"Linhas que estão na tela (já filtradas), até {MAX_ROWS}. Escolha colunas e ordenação para ver extremos.",
        {
            "type": "object",
            "properties": {
                "colunas": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Colunas a trazer (padrão: todas).",
                },
                "ordenar_por": {"type": "string", "description": "Coluna para ordenar."},
                "decrescente": {"type": "boolean"},
                "limite": {"type": "integer", "minimum": 1, "maximum": MAX_ROWS},
            },
        },
        tela_linhas,
    ),
    Tool(
        "tela_estatisticas",
        "tela",
        "Estatísticas de uma coluna da tela: vazios, mínimo, máximo, média, mediana; ou contagem por categoria.",
        {"type": "object", "properties": {"coluna": {"type": "string"}}, "required": ["coluna"]},
        tela_estatisticas,
    ),
    Tool(
        "flex_ensaio",
        "flex",
        "Um ensaio FLEX completo, com os alertas de qualidade dele.",
        ID_PARAM,
        _record_tool("flex_ensaios", "PSI-69"),
    ),
    Tool(
        "flex_agrupar",
        "flex",
        "Conta ensaios FLEX por uma coluna e, se pedido, resume uma medida em cada grupo.",
        _group_params(FLEX_GROUPS, FLEX_MEASURES, "diâmetros, tempo, taxa de queima"),
        _group_tool("flex_ensaios"),
    ),
    Tool(
        "bass_teste",
        "bass",
        "Um teste BASS-II completo (texto original do material incluído) e seus alertas.",
        ID_PARAM,
        _record_tool("bass_ensaios", "PSI-25"),
    ),
    Tool(
        "bass_agrupar",
        "bass",
        "Conta testes BASS-II por uma coluna e, se pedido, resume uma medida em cada grupo. "
        "Os resumos de gases não são ranking de risco.",
        _group_params(BASS_GROUPS, BASS_MEASURES, "gases, dimensões"),
        _group_tool("bass_ensaios"),
    ),
    Tool(
        "psi117_comparar",
        "psi117",
        "Medido × modelo por pressão, com diferença, faixa de incerteza e se o modelo cai dentro dela.",
        {
            "type": "object",
            "properties": {
                "tipo_chama": {"type": "string", "enum": FLAMES},
                "pressao_atm": {"type": "number", "description": "0.5, 0.75, 1, 1.25 ou 3."},
            },
        },
        psi117_comparar,
    ),
    Tool(
        "psi117_pontos",
        "psi117",
        "Os pontos como estão na fonte, com a linha e a coluna originais.",
        {
            "type": "object",
            "properties": {
                "tipo_chama": {"type": "string", "enum": FLAMES},
                "serie": {
                    "type": "string",
                    "enum": ["Medição", "Modelo", "Limite superior", "Limite inferior"],
                },
            },
        },
        psi117_pontos,
    ),
    Tool(
        "alertas",
        "qualidade",
        "Alertas de qualidade: células que não puderam ser lidas como estão, com o valor original.",
        {
            "type": "object",
            "properties": {
                "investigacao": INV_PARAM,
                "teste_id": {"type": "string"},
                "tipo": {"type": "string", "enum": sorted(dictionary.ALERTS)},
            },
        },
        alertas,
    ),
    Tool(
        "fonte_dos_dados",
        "qualidade",
        "De que arquivo vieram os dados, se é amostra ou completo, e por que outros arquivos não foram usados.",
        {"type": "object", "properties": {"investigacao": INV_PARAM}},
        fonte_dos_dados,
    ),
    Tool(
        "cautelas",
        "qualidade",
        "O que a investigação responde, o que NÃO se pode concluir dela e os links da NASA. "
        "Consulte antes de qualquer interpretação.",
        {"type": "object", "properties": {"investigacao": INV_PARAM}},
        cautelas,
    ),
    Tool(
        "listar_investigacoes",
        "catalogo",
        "As três investigações: pergunta, tipo de evidência, registros, se é amostra e nº de alertas.",
        {"type": "object", "properties": {}},
        listar_investigacoes,
    ),
    Tool(
        "inventario_arquivos",
        "catalogo",
        "Os arquivos de dados/ e o que foi feito com cada um.",
        {"type": "object", "properties": {"status": {"type": "string", "enum": STATUSES}}},
        inventario_arquivos,
    ),
    Tool(
        "dicionario",
        "dicionario",
        "Significado, unidade e cabeçalho original de uma coluna; ou o que quer dizer uma categoria ou tipo de alerta.",
        {
            "type": "object",
            "properties": {
                "termo": {"type": "string", "description": "Nome da coluna, categoria ou tipo de alerta."},
                "tabela": {"type": "string", "enum": sorted(dictionary.COLUMNS)},
            },
            "required": ["termo"],
        },
        dicionario,
    ),
]
TOOLS = {t.name: t for t in _ALL}
