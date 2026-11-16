"""Cliente da Zyria: API compatível com a da OpenAI, então usa o SDK `openai` com outra base_url.

Configuração no `.env`:
    ZYRIA_BASE_URL  ex.: https://SEU_HOST/api/public/v1
    ZYRIA_API_KEY   ex.: zy_live_xxx
    ZYRIA_MODEL     padrão: anthropic/claude-sonnet-5.5 (precisa aceitar tools)

O catálogo de modelos varia por credencial: `GET /models` lista os disponíveis. O exemplo da
documentação (`zyria-smart`) não existe em toda conta.
"""

from __future__ import annotations

import functools
import json
import os
from collections.abc import Iterator
from dataclasses import dataclass, field

import openai

DEFAULT_MODEL = "anthropic/claude-sonnet-5.5"
LABEL = "zorbital-dashboard"  # agrupa o consumo deste app nos relatórios da Zyria (`zyria_label`)

# Códigos de erro da documentação da Zyria → o que dizer para quem está usando o painel.
ERRORS = {
    "invalid_token": "Chave da Zyria inválida ou ausente. Confira ZYRIA_API_KEY no .env.",
    "credential_inactive": "A credencial da Zyria está inativa.",
    "credential_expired": "A credencial da Zyria expirou.",
    "ip_blocked": "A credencial da Zyria não aceita chamadas deste IP.",
    "origin_blocked": "A credencial da Zyria não aceita chamadas desta origem.",
    "model_not_found": "O modelo configurado em ZYRIA_MODEL não existe ou está inativo.",
    "insufficient_funds": "Saldo de Z Token (ZYT) esgotado. É preciso recarregar.",
    "limit_zyt_dia": "Limite diário de ZYT atingido.",
    "limit_zyt_semana": "Limite semanal de ZYT atingido.",
    "limit_zyt_mes": "Limite mensal de ZYT atingido.",
    "limit_req_minuto": "Muitas perguntas por minuto. Aguarde um pouco.",
    "limit_req_hora": "Limite de perguntas por hora atingido.",
    "all_providers_failed": "Os provedores do modelo falharam. Tente de novo em instantes.",
    "no_providers": "O modelo está cadastrado na Zyria, mas sem provedor ativo.",
}


class ProviderError(Exception):
    """Falha da Zyria já traduzida para a pessoa que usa o painel."""


@dataclass
class Config:
    base_url: str | None
    api_key: str | None
    model: str

    @classmethod
    def from_env(cls) -> Config:
        return cls(
            base_url=os.environ.get("ZYRIA_BASE_URL") or None,
            api_key=os.environ.get("ZYRIA_API_KEY") or None,
            model=os.environ.get("ZYRIA_MODEL") or DEFAULT_MODEL,
        )

    def missing(self) -> list[str]:
        return [
            name for name, v in (("ZYRIA_BASE_URL", self.base_url), ("ZYRIA_API_KEY", self.api_key)) if not v
        ]


@dataclass
class Turn:
    """Uma resposta do modelo, montada a partir do streaming."""

    text: str = ""
    tool_calls: list[dict] = field(default_factory=list)  # [{"id", "name", "arguments"}]
    finish_reason: str | None = None
    usage: dict | None = None  # evento custom da Zyria: custo_zyt, saldo_zyt, tokens


def client(config: Config) -> openai.OpenAI:
    if missing := config.missing():
        raise ProviderError(f"Assistente não configurado: preencha {', '.join(missing)} no .env.")
    return openai.OpenAI(base_url=config.base_url, api_key=config.api_key, max_retries=2, timeout=90)


def stream_turn(
    api: openai.OpenAI, model: str, messages: list[dict], tools: list[dict], *, max_tokens: int = 1500
) -> Iterator[str | Turn]:
    """Faz uma chamada em streaming. Rende os pedaços de texto e, no fim, o `Turn` completo."""
    turn, calls = Turn(), {}
    try:
        stream = api.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools or openai.omit,
            tool_choice="auto" if tools else openai.omit,
            temperature=0.2,
            max_tokens=max_tokens,
            stream=True,
            extra_body={"zyria_label": LABEL},
        )
        for chunk in stream:
            # O último pedaço antes do [DONE] é um evento da Zyria, sem `choices`.
            if extra := getattr(chunk, "zyria", None):
                turn.usage = dict(extra)
            for choice in chunk.choices or []:
                delta = choice.delta
                if delta and delta.content:
                    turn.text += delta.content
                    yield delta.content
                for call in (delta.tool_calls or []) if delta else []:
                    slot = calls.setdefault(call.index, {"id": "", "name": "", "arguments": ""})
                    slot["id"] = call.id or slot["id"]
                    if call.function:
                        slot["name"] += call.function.name or ""
                        slot["arguments"] += call.function.arguments or ""
                if choice.finish_reason:
                    turn.finish_reason = choice.finish_reason
    except openai.APITimeoutError as error:
        raise ProviderError("A Zyria demorou demais para responder. Tente de novo.") from error
    except openai.APIConnectionError as error:
        raise ProviderError("Sem conexão com a Zyria. Confira a rede e ZYRIA_BASE_URL.") from error
    except openai.APIError as error:
        # Inclui o erro que a Zyria manda como evento SSE depois do HTTP 200 (ex.: modelo inexistente),
        # que o SDK levanta como APIError genérico, sem status HTTP.
        raise ProviderError(_explain(error, api, model)) from error
    turn.tool_calls = [calls[i] for i in sorted(calls)]
    yield turn


def _explain(error: openai.APIError, api: openai.OpenAI | None = None, model: str | None = None) -> str:
    body = error.body if isinstance(error.body, dict) else {}
    nested = body.get("error") if isinstance(body.get("error"), dict) else {}
    code = getattr(error, "code", None) or body.get("code") or nested.get("code")
    message = nested.get("message") or body.get("message") or error.message
    if code == "model_not_found" or (message and "não existe ou está inativo" in message):
        return _model_hint(api, model)
    if code in ERRORS:
        return ERRORS[code]
    if code and str(code).startswith(("schedule_", "model_not_allowed")):
        return f"A credencial da Zyria bloqueou esta chamada ({code})."
    status = getattr(error, "status_code", None)
    response = getattr(error, "response", None)
    request_id = response.headers.get("x-request-id") if response is not None else None
    parts = [f"A Zyria respondeu com erro{f' {status}' if status else ''}{f' ({code})' if code else ''}"]
    if message:
        parts.append(f": {message}")
    if request_id:
        parts.append(f" · request id {request_id}")
    return "".join(parts) + "."


def _model_hint(api: openai.OpenAI | None, model: str | None) -> str:
    text = (
        f"O modelo '{model}' não existe ou está inativo nesta credencial da Zyria. Ajuste ZYRIA_MODEL no .env"
    )
    examples = [m for m in PREFERRED if m in tool_models(api)] if api else []
    return text + (f"; modelos com ferramentas disponíveis: {', '.join(examples)}." if examples else ".")


# Sugeridos quando o modelo configurado falha, do mais barato ao mais capaz (todos aceitam tools).
PREFERRED = [
    "anthropic/claude-haiku-5.5",
    "openai/gpt-5-mini",
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-opus-5.5",
]


def tool_models(api: openai.OpenAI) -> set[str]:
    """Modelos de chat que esta credencial pode usar e que aceitam tools (vazio se o catálogo falhar)."""
    return _catalog(str(api.base_url), api.api_key)


@functools.lru_cache(maxsize=4)
def _catalog(base_url: str, api_key: str) -> set[str]:
    try:
        api = openai.OpenAI(base_url=base_url, api_key=api_key, max_retries=1, timeout=20)
        items = json.loads(api.models.with_raw_response.list().text).get("data", [])
    except (openai.APIError, ValueError):
        return set()
    return {
        m["id"]
        for m in items
        if isinstance(m, dict)
        and m.get("tipo_modelo", "chat") == "chat"
        and "tools" in (m.get("capacidades") or [])
    }


def check_model(api: openai.OpenAI, model: str) -> None:
    """Falha cedo, com explicação, se o modelo não aceita ferramentas. Sem catálogo, não bloqueia."""
    available = tool_models(api)
    if available and model not in available:
        raise ProviderError(
            _model_hint(api, model).replace(
                "não existe ou está inativo", "não existe, está inativo ou não aceita ferramentas"
            )
        )
