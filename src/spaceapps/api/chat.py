"""Assistente: o front envia o estado da tela e o histórico; a resposta volta em NDJSON, em streaming.

Cada linha do corpo é um evento:
    {"type": "studies", "items": [{...}]}           fichas dos estudos envolvidos, lidas antes de consultar
    {"type": "text", "text": "..."}                 pedaço da resposta
    {"type": "tool", "label": "flex_ensaio(...)", "name": "flex_ensaio", "group": "flex", "study": false}
                                                    consulta feita; `study` diz se foi à ficha de um estudo
    {"type": "done", "cost": 0.12, "history": [...]} fim do turno, com o histórico para a próxima pergunta
    {"type": "error", "message": "..."}             falha já explicada para quem usa o painel

O servidor não guarda conversa: o histórico (formato OpenAI) fica no navegador e volta a cada pergunta.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..assistant import agent, tools
from ..assistant.screen import Screen
from ..integrations import provider
from .frames import frame_from_rows

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/assistant")

MAX_SCREEN_ROWS = 5000  # a tela mostra bem menos; o limite só evita corpos enormes


class ScreenIn(BaseModel):
    pagina: str
    titulo: str
    investigacao: str | None = None
    escopo: list[str] | None = None
    filtros: dict[str, Any] = Field(default_factory=dict)
    graficos: list[str] = Field(default_factory=list)
    colunas: list[str] | None = None
    dados: list[dict[str, Any]] | None = Field(default=None, max_length=MAX_SCREEN_ROWS)
    tabela_banco: str | None = None

    def build(self) -> Screen:
        if self.pagina not in tools.PAGE_GROUPS:
            raise HTTPException(422, f"Página desconhecida: {self.pagina}")
        frame = None if self.dados is None else frame_from_rows(self.dados, self.colunas)
        return Screen(
            pagina=self.pagina,
            titulo=self.titulo,
            investigacao=self.investigacao,
            escopo=self.escopo,
            filtros=self.filtros,
            graficos=self.graficos,
            dados=frame,
            tabela_banco=self.tabela_banco,
        )


class ChatIn(BaseModel):
    screen: ScreenIn
    history: list[dict[str, Any]] = Field(default_factory=list)
    question: str = Field(min_length=1, max_length=4000)
    lang: Literal["en", "pt"] = "en"  # idioma da interface: é nele que o assistente responde


@router.get("/pages")
def pages() -> dict[str, list[str]]:
    """Grupos de ferramentas ligados em cada página (o painel mostra na legenda)."""
    return tools.PAGE_GROUPS


def _line(event: dict) -> bytes:
    return (json.dumps(event, ensure_ascii=False, default=str) + "\n").encode()


def _events(screen: Screen, history: list[dict], question: str, lang: str) -> Iterator[bytes]:
    cost = None
    try:
        for item in agent.answer(screen, history, question, lang=lang):
            if isinstance(item, agent.Studies):
                yield _line({"type": "studies", "items": item.items})
            elif isinstance(item, agent.ToolUse):
                tool = tools.TOOLS.get(item.name)
                group = tool.group if tool else None
                yield _line(
                    {
                        "type": "tool",
                        "label": agent.describe_call(item),
                        "name": item.name,
                        "group": group,
                        "study": group in tools.STUDY_GROUPS,
                    }
                )
            elif isinstance(item, agent.Done):
                cost = (item.usage or {}).get("custo_zyt")
            else:
                yield _line({"type": "text", "text": item})
    except provider.ProviderError as error:
        yield _line({"type": "error", "message": str(error)})
        return
    except Exception as error:  # nenhuma falha pode deixar o painel mudo
        log.exception("Falha inesperada no assistente")
        name = type(error).__name__
        message = (
            f"Erro inesperado no assistente ({name}). Detalhes no log do servidor."
            if lang == "pt"
            else f"Unexpected assistant error ({name}). Details in the server log."
        )
        yield _line({"type": "error", "message": message})
        return
    yield _line({"type": "done", "cost": cost, "history": history})


@router.post("/chat")
def chat(body: ChatIn) -> StreamingResponse:
    screen = body.screen.build()
    history = list(body.history)  # `agent.answer` acrescenta o turno; só volta ao front se terminar bem
    return StreamingResponse(
        _events(screen, history, body.question, body.lang),
        media_type="application/x-ndjson",
        # `identity` impede o GZip de segurar os pedaços no buffer: cada linha sai assim que fica pronta
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Content-Encoding": "identity"},
    )
