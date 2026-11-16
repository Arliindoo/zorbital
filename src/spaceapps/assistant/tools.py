"""Ferramentas do assistente, organizadas em grupos, e os grupos que cada página liga.

Regras de escopo, garantidas aqui e não só no prompt:
- Só existem consultas prontas, com colunas de uma lista fechada. Não há SQL livre nem web.
- Nas páginas de investigação, as ferramentas de qualidade só respondem sobre aquela investigação.
- Só os grupos `comparacao` (PSI-117 × CFI) e `fichas` (fichas lado a lado), nas páginas de comparação,
  cruzam investigações; eles devolvem junto a correspondência entre as fontes, os vínculos e as cautelas.
  O `fichas` só compara os estudos escolhidos na tela.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass

import polars as pl

from .. import db
from ..datasets import dictionary
from ..evidence import fichas
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
    "psi117": "Tabelas do PSI-117: medição × modelo por pressão, extinção a 1 atm e catálogo das tabelas.",
    "cfi": "Consultas na tabela do CFI (chamas frias de gotas de n-dodecano e misturas, ISS).",
    "psi142": "Conjuntos e pontos digitalizados do PSI-142 (chamas em contrafluxo, Princeton).",
    "comparacao": "Comparação PSI-117 × CFI do diâmetro de extinção, com a correspondência entre as fontes.",
    "fichas": "Fichas dos estudos escolhidos lado a lado: o que têm em comum, o que se sobrepõe e o que não.",
    "qualidade": "Alertas de qualidade, origem dos dados e o que não concluir.",
    "catalogo": "As investigações e os arquivos de dados/.",
    "dicionario": "Significado de colunas, unidades, categorias e tipos de alerta.",
}

PAGE_GROUPS = {
    "overview": ["catalogo", "qualidade", "dicionario"],
    "flex": ["tela", "flex", "qualidade", "dicionario"],
    "bass": ["tela", "bass", "qualidade", "dicionario"],
    "psi117": ["tela", "psi117", "qualidade", "dicionario"],
    "cfi": ["tela", "cfi", "qualidade", "dicionario"],
    "psi142": ["tela", "psi142", "qualidade", "dicionario"],
    "comparacao": ["tela", "comparacao", "qualidade", "dicionario"],
    "estudos": ["tela", "qualidade", "dicionario"],
    "fichas": ["tela", "fichas", "qualidade", "dicionario"],
    "explore": ["tela", "dicionario"],
}

INVESTIGATIONS = ["PSI-69", "PSI-25", "PSI-117", "PSI-39", "PSI-142"]

# Grupos cujas ferramentas consultam a ficha dos estudos (cautelas, origem, catálogo), e não os dados.
STUDY_GROUPS = frozenset({"qualidade", "catalogo"})


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


def _known_investigations() -> list[str]:
    """As do catálogo e as enviadas pelo painel."""
    try:
        return db.query("SELECT id FROM investigacoes")["id"].to_list()
    except Exception:  # noqa: BLE001 — sem banco, só as do catálogo
        return INVESTIGATIONS


def _scoped_investigation(screen: Screen, requested: str | None) -> list[str] | None:
    """Investigações a consultar. Na página de uma investigação, só ela; na comparação, as duas dela;
    na visão geral, qualquer uma (None = todas)."""
    allowed = screen.allowed()
    if requested and requested not in (known := _known_investigations()):
        raise ToolError(f"Investigação desconhecida: {requested}. Opções: {known}.")
    if allowed and requested and requested not in allowed:
        raise ToolError(f"Esta página é de {', '.join(allowed)}; para {requested}, abra a página dela.")
    if requested:
        return [requested]
    return allowed


def studies_in_scope(screen: Screen) -> list[dict]:
    """Ficha dos estudos envolvidos na página: a investigação dela, as duas da comparação, ou todas
    na visão geral. Páginas sem ferramentas de estudo (o explorador livre) não têm nenhuma."""
    if not STUDY_GROUPS & set(PAGE_GROUPS[screen.pagina]):
        return []
    where, params = _in("id", screen.allowed())
    rows = db.query(
        "SELECT id, nome, categoria, ambiente, tipo_evidencia, pergunta, cautelas, url_nasa, relatorio, doi, "
        f"fonte_carregada FROM investigacoes WHERE {where} ORDER BY id",
        params,
    )
    return _rows(rows)


def _in(column: str, values: list[str] | None) -> tuple[str, list]:
    """Filtro SQL `column IN (...)`, ou nenhum filtro quando a lista é None."""
    if not values:
        return "true", []
    return f"{column} IN ({', '.join('?' for _ in values)})", list(values)


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
    where, params = _in("investigacao", _scoped_investigation(screen, investigacao))
    for column, value in (("teste_id", teste_id), ("tipo", tipo)):
        if value:
            where, params = where + f" AND {column} = ?", [*params, str(value)]
    rows = db.query(f"SELECT * FROM alertas WHERE {where} ORDER BY investigacao, tipo, teste_id", params)
    return {
        "total": rows.height,
        "por_tipo": _rows(
            rows.group_by("investigacao", "tipo").len("ocorrencias").sort("ocorrencias", descending=True)
        ),
        "alertas": _rows(rows.head(MAX_ROWS)),
        "significado_dos_tipos": {
            t: dictionary.ALERTS[t] for t in set(rows["tipo"]) if t in dictionary.ALERTS
        },
    }


def fonte_dos_dados(screen: Screen, investigacao: str | None = None) -> dict:
    invs = _scoped_investigation(screen, investigacao)
    where, params = _in("investigacao", invs)
    files = db.query(
        "SELECT caminho, investigacao, papel, status, motivo, linhas_carregadas, git_blob_sha1 "
        f"FROM fontes WHERE {where} ORDER BY investigacao, status",
        params,
    )
    where_inv, params_inv = _in("id", invs)
    loaded = db.query(
        f"SELECT id, fonte_carregada, fontes_carregadas FROM investigacoes WHERE {where_inv}", params_inv
    )
    result = {
        "fonte_carregada": _rows(loaded),
        "arquivos": _rows(files),
        "proveniencia": "Tabelas do portal NASA PSI (algumas por cópia pública no GitHub); conferir com o PSI.",
    }
    if (invs is None or "PSI-117" in invs) and "psi117_tabelas" in set(db.tables()):
        result["tabelas_do_psi117_segundo_o_readme"] = _rows(
            db.query("SELECT arquivo, presente_em_dados, combustivel, d0_mm_texto, pressao_atm_texto, doi, figura "
                     "FROM psi117_tabelas")
        )  # fmt: skip
    return result


def cautelas(screen: Screen, investigacao: str | None = None) -> dict:
    where, params = _in("id", _scoped_investigation(screen, investigacao))
    rows = db.query(
        f"SELECT id, nome, pergunta, cautelas, url_nasa, relatorio, doi FROM investigacoes WHERE {where}",
        params,
    )
    result = {"investigacoes": _rows(rows), "cautela_geral": db.meta()["geral"]}
    detailed = len(result["investigacoes"]) == 1  # com várias, só o essencial (o resultado tem limite)
    if not detailed:
        result["nota"] = (
            "Resumo de várias investigações; peça uma só para ver a ficha, a hipótese e a abordagem."
        )
    for inv in result["investigacoes"]:
        meta, publications = db.metadata(inv["id"])
        if not detailed:
            if meta:
                inv["portal_nasa"] = {k: meta.get(k) for k in ("objetivo", "equipamento")}
            continue
        sheet, links = db.ficha(inv["id"])
        if sheet.height:
            inv["ficha"] = _rows(sheet.select("secao", "rotulo", "unidade", "natureza", "valores", "situacao",
                                              "evidencia", "nota"))  # fmt: skip
        if links.height:
            inv["condicoes_nao_independentes"] = _rows(links.select("variavel_a", "variavel_b", "exemplos"))
        if meta:
            inv["portal_nasa"] = {k: meta.get(k) for k in ("objetivo", "hipotese", "abordagem", "equipamento",
                                                          "plataforma", "inicio", "fim", "palavras_chave")}  # fmt: skip
        if publications.height:
            inv["publicacoes"] = {"total": publications.height,
                                  "primeiras": _rows(publications.select("titulo", "doi", "link").head(8))}  # fmt: skip
    return result


INV_PARAM = {
    "type": "string",
    "description": "Número da investigação (ex.: PSI-69, PSI-25, PSI-117, PSI-39, PSI-142 ou um estudo enviado). "
    "Nas páginas de investigação, só a da página.",
}

# --- Grupo catalogo -----------------------------------------------------------------------------


def listar_investigacoes(screen: Screen) -> dict:
    rows = db.query(
        """SELECT i.id, i.nome, i.categoria, i.ambiente, i.tipo_evidencia, i.pergunta, i.tabela,
                  i.fonte_carregada, coalesce(a.n, 0) AS alertas
           FROM investigacoes i LEFT JOIN (SELECT investigacao, count(*) n FROM alertas GROUP BY 1) a
           ON a.investigacao = i.id"""
    )
    existing = set(db.tables())
    out = []
    for r in _rows(rows):
        r["registros"] = (
            db.query(f'SELECT count(*) FROM "{r["tabela"]}"').item() if r["tabela"] in existing else 0
        )
        r["amostra"] = "amostra" in (r["fonte_carregada"] or "").lower()
        out.append(r)
    missing = (
        _rows(db.query("SELECT arquivo FROM psi117_tabelas WHERE NOT presente_em_dados"))
        if "psi117_tabelas" in existing else []
    )  # fmt: skip
    return {"investigacoes": out, "tabelas_psi117_faltando": [m["arquivo"] for m in missing]}


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
    found = dictionary.lookup(termo, tabela or screen.tabela_banco)
    if "erro" not in found or "estudo_colunas" not in set(db.tables()):
        return found
    # estudos enviados: o dicionário vem da especificação aprovada, com a evidência de cada interpretação
    rows = db.query("SELECT * FROM estudo_colunas WHERE coluna = ? OR origem = ?", [termo, termo])
    if screen.investigacao:
        rows = rows.filter(pl.col("investigacao") == screen.investigacao)
    return {"tipo": "coluna de estudo enviado", "linhas": _rows(rows)} if rows.height else found


# --- Registro -----------------------------------------------------------------------------------

# --- Grupos psi117 (tabelas extras), psi142 e comparacao --------------------------------------------


def psi117_extincao_1atm(screen: Screen, combustivel: str | None = None) -> dict:
    sql, params = "SELECT * EXCLUDE (fonte_arquivo) FROM psi117_extincao_1atm", []
    if combustivel:
        sql, params = sql + " WHERE combustivel = ?", [combustivel]
    rows = db.query(sql + " ORDER BY combustivel, serie, d0_mm", params)
    return {
        "nota": "Medição = ensaios de voo; Modelo = simulação. Zeros: sem extinção ou sem chama.",
        "linhas": _rows(rows),
    }


def psi142_conjuntos(screen: Screen) -> dict:
    rows = db.query("SELECT * EXCLUDE (fonte_arquivo) FROM psi142_conjuntos ORDER BY conjunto_id")
    series = db.query(
        "SELECT conjunto_id, serie, x_nome, y_nome, count(*) AS pontos FROM psi142_pontos GROUP BY ALL ORDER BY ALL"
    )
    return {"conjuntos": _rows(rows), "series": _rows(series)}


def psi142_serie(screen: Screen, conjunto_id: int, serie: str | None = None) -> dict:
    sql, params = (
        "SELECT serie, x_nome, x, y_nome, y, linha_fonte FROM psi142_pontos WHERE conjunto_id = ?",
        [int(conjunto_id)],
    )
    if serie:
        sql, params = sql + " AND serie = ?", [*params, serie]
    rows = db.query(sql + " ORDER BY serie, linha_fonte", params)
    if rows.is_empty():
        raise ToolError("Nenhum ponto. Use psi142_conjuntos para ver os conjuntos e séries existentes.")
    summary = rows.group_by("serie", "x_nome", "y_nome", maintain_order=True).agg(
        pl.len().alias("pontos"), pl.col("x").min().alias("x_min"), pl.col("x").max().alias("x_max"),
        pl.col("y").min().alias("y_min"), pl.col("y").max().alias("y_max"),
    )  # fmt: skip
    return {
        "resumo_por_serie": _rows(summary),
        "pontos": _rows(rows.head(MAX_ROWS)),
        "total_pontos": rows.height,
    }


def comparacao_c12(screen: Screen, tipo_chama: str | None = None, pressao_atm: float | None = None) -> dict:
    """A comparação da tela (com os filtros dela) ou, sem tela, a visão padrão do banco."""
    frame = screen.dados if screen.dados is not None and screen.pagina == "comparacao" else db.query(
        "SELECT * FROM v_extincao_c12_comparacao"
    )  # fmt: skip
    if tipo_chama:
        frame = frame.filter(pl.col("tipo_chama") == tipo_chama)
    if pressao_atm is not None:
        frame = frame.filter(pl.col("pressao_atm") == float(pressao_atm))
    return {
        "base": "filtros da tela" if screen.dados is not None else "padrão: n-dodecano sem hélio",
        "linhas": _rows(frame),
        "cautela": "As medições do PSI-117 vêm de ensaios no aparelho do FLEX, o mesmo do CFI: a comparação "
        "não é validação independente. Use comparacao_correspondencia para ver ponto a ponto.",
    }


def comparacao_correspondencia(screen: Screen) -> dict:
    rows = db.query("SELECT * FROM psi117_cfi_correspondencia")
    summary = rows.group_by("tabela_psi117", "situacao").len("pontos").sort("tabela_psi117")
    return {"resumo": _rows(summary), "pontos": _rows(rows)}


def comparar_fichas(screen: Screen, investigacoes: list[str] | None = None) -> dict:
    """Fichas lado a lado, só entre os estudos escolhidos na tela."""
    chosen = screen.escopo or []
    ids = investigacoes or chosen
    if outside := [i for i in ids if i not in chosen]:
        raise ToolError(f"Só os estudos escolhidos na tela podem ser comparados: {', '.join(chosen)}. "
                        f"Fora da seleção: {', '.join(outside)}.")  # fmt: skip
    if not 2 <= len(ids) <= 4:
        raise ToolError("Compare de 2 a 4 estudos.")
    names = set(db.tables())
    if "ficha" not in names:
        raise ToolError("O banco não tem a ficha dos estudos; rode a carga de novo.")
    result = fichas.compare(
        db.query("SELECT * FROM ficha"),
        db.query("SELECT * FROM ficha_vinculos") if "ficha_vinculos" in names else pl.DataFrame(),
        db.query("SELECT * FROM investigacoes"),
        ids,
        db.query("SELECT * FROM metadados") if "metadados" in names else None,
    )
    return {
        "tabela": _rows(result["tabela"]),
        "faixas_comuns_a_todos": result["janelas_comuns"],
        "pares": [p.as_dict() for p in result["pares"]],
        "regra": "Faixas que se cruzam indicam uma janela comparável, não testes nas mesmas condições "
        "combinadas. Combustível, ambiente e tipo de evidência diferentes entram como avisos, não como "
        "conclusão. Grandezas iguais com unidades diferentes não se comparam em número.",
    }


FLEX_GROUPS = ["desfecho", "oxigenio_fracao", "pressao_mmhg", "combustivel", "helio_fracao"]
FLEX_MEASURES = [
    "diametro_inicial_mm",
    "diametro_extincao_visivel_mm",
    "tempo_queima_s",
    "taxa_queima_valor",
    "oxigenio_fracao",
    "pressao_mmhg",
]
CFI_GROUPS = ["combustivel", "diluente", "pressao_atm", "fibra", "analise_completa", "dext_fria_zero_na_fonte",
              "dext_fria_extrapolado", "reignicoes"]  # fmt: skip
CFI_MEASURES = ["d0_mm", "dext_quente_mm", "dext_fria_mm", "k_quente_mm2_s", "k_fria_mm2_s", "tempo_chama_quente",
                "oxigenio_fracao", "helio_fracao", "reignicoes"]  # fmt: skip
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
        "De que arquivo vieram os dados, se é amostra ou completo, por que outros arquivos não foram usados "
        "e, no PSI-117, quais tabelas do ReadMe ainda faltam.",
        {"type": "object", "properties": {"investigacao": INV_PARAM}},
        fonte_dos_dados,
    ),
    Tool(
        "cautelas",
        "qualidade",
        "O que a investigação responde, o que NÃO se pode concluir dela, os links da NASA, o objetivo, a "
        "hipótese, o equipamento e as publicações (metadados do portal), e a ficha "
        "(combustível, amostra, condições, medições, o que variou e o que ficou fixo, e as condições que não "
        "variaram de forma independente). Consulte antes de qualquer interpretação.",
        {"type": "object", "properties": {"investigacao": INV_PARAM}},
        cautelas,
    ),
    Tool(
        "listar_investigacoes",
        "catalogo",
        "Todas as investigações do painel: pergunta, tipo de evidência, registros, se é amostra e nº de alertas.",
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
    Tool(
        "cfi_ensaio",
        "cfi",
        "Um ensaio do CFI completo (condições, resultados, comentário) e seus alertas.",
        ID_PARAM,
        _record_tool("cfi_ensaios", "PSI-39"),
    ),
    Tool(
        "cfi_agrupar",
        "cfi",
        "Conta ensaios do CFI por uma coluna e, se pedido, resume uma medida (diâmetros, taxas de queima).",
        _group_params(CFI_GROUPS, CFI_MEASURES, "diâmetros de extinção, taxas de queima"),
        _group_tool("cfi_ensaios"),
    ),
    Tool(
        "psi117_extincao_1atm",
        "psi117",
        "Extinção a 1 atm de n-heptano, n-decano e n-dodecano por diâmetro inicial, medida e simulada.",
        {
            "type": "object",
            "properties": {
                "combustivel": {"type": "string", "enum": ["n-heptano", "n-decano", "n-dodecano"]}
            },
        },
        psi117_extincao_1atm,
    ),
    Tool(
        "psi142_conjuntos",
        "psi142",
        "Os 8 conjuntos do PSI-142: artigo, figura, descrições (planilha e CSV), DOI e as séries de cada um.",
        {"type": "object", "properties": {}},
        psi142_conjuntos,
    ),
    Tool(
        "psi142_serie",
        "psi142",
        f"Pontos de um conjunto do PSI-142 (até {MAX_ROWS}) e o resumo de cada série.",
        {
            "type": "object",
            "properties": {
                "conjunto_id": {"type": "integer", "minimum": 1, "maximum": 8},
                "serie": {"type": "string"},
            },
            "required": ["conjunto_id"],
        },
        psi142_serie,
    ),
    Tool(
        "comparacao_c12",
        "comparacao",
        "Diâmetro de extinção por pressão lado a lado: PSI-117 (medido, modelo, faixa) e CFI (mediana, mín., máx.).",
        {
            "type": "object",
            "properties": {
                "tipo_chama": {"type": "string", "enum": FLAMES},
                "pressao_atm": {"type": "number"},
            },
        },
        comparacao_c12,
    ),
    Tool(
        "comparacao_correspondencia",
        "comparacao",
        "Quais medições do PSI-117 são ensaios do CFI, ponto a ponto, e onde os valores divergem.",
        {"type": "object", "properties": {}},
        comparacao_correspondencia,
    ),
    Tool(
        "comparar_fichas",
        "fichas",
        "Compara as fichas dos estudos escolhidos na tela: combustíveis, amostras, faixas de O2, pressão e "
        "tamanho na mesma unidade, o que se sobrepõe, o que medem em comum, o veredito de cada par e os avisos "
        "(ambientes, evidência, condições que não variaram de forma independente).",
        {
            "type": "object",
            "properties": {
                "investigacoes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 2,
                    "maxItems": 4,
                    "description": "Subconjunto dos estudos escolhidos na tela (ex.: ['PSI-69', 'PSI-39']). "
                    "Sem ele, compara todos os escolhidos.",
                }
            },
        },
        comparar_fichas,
    ),  # fmt: skip
]
TOOLS = {t.name: t for t in _ALL}
