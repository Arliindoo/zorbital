"""Assistente: grupos e escopo das ferramentas, e o laço contra um servidor que imita a Zyria."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import polars as pl
import pytest

from spaceapps import db
from spaceapps.assistant import agent, provider, tools
from spaceapps.assistant.screen import Screen


@pytest.fixture
def flex_screen(use_db):
    data = db.query("SELECT * FROM flex_ensaios")
    return Screen(
        pagina="flex", titulo="FLEX", investigacao="PSI-69", filtros={"desfecho": ["Extinção"]},
        graficos=["dispersão"], dados=data.filter(pl.col("desfecho") == "Extinção"), tabela_banco="flex_ensaios",
    )  # fmt: skip


def run(screen, name, **args):
    return json.loads(tools.execute(name, json.dumps(args), screen))


# --- Grupos -------------------------------------------------------------------------------------


def test_every_group_has_tools_and_every_page_uses_known_groups():
    used = {t.group for t in tools.TOOLS.values()}
    assert used == set(tools.GROUPS)
    for page, groups in tools.PAGE_GROUPS.items():
        assert set(groups) <= set(tools.GROUPS), page
        assert len(tools.tools_for(page)) <= 10, f"{page}: ferramentas demais confundem a escolha do modelo"


def test_each_investigation_page_only_sees_its_own_tools():
    names = {page: {t.name for t in tools.tools_for(page)} for page in tools.PAGE_GROUPS}
    assert "bass_agrupar" not in names["flex"] and "psi117_comparar" not in names["flex"]
    assert "flex_agrupar" not in names["bass"]
    assert not any(n.startswith("tela_") for n in names["overview"])  # a visão geral não tem tabela na tela
    assert "alertas" not in names["explore"]


def test_tool_from_another_page_is_refused(flex_screen):
    assert "não está disponível" in run(flex_screen, "bass_agrupar", por="geometria")["erro"]


def test_quality_tools_are_locked_to_the_page_investigation(flex_screen):
    assert "PSI-69" in run(flex_screen, "alertas", investigacao="PSI-25")["erro"]
    found = run(flex_screen, "alertas")
    assert found["total"] > 0
    assert {a["investigacao"] for a in found["alertas"]} == {"PSI-69"}


def test_unknown_parameters_are_refused(flex_screen):
    assert "desconhecidos" in run(flex_screen, "tela_linhas", sql="DROP TABLE x")["erro"]


# --- Ferramentas --------------------------------------------------------------------------------


def test_screen_rows_respect_filters_and_cap(flex_screen):
    result = run(flex_screen, "tela_linhas", colunas=["teste_id", "desfecho"], limite=500)
    assert result["linhas_na_tela"] == 2  # só as extinções do filtro
    assert {r["desfecho"] for r in result["linhas"]} == {"Extinção"}


def test_group_can_use_screen_or_whole_table(flex_screen):
    on_screen = run(flex_screen, "flex_agrupar", por="desfecho")
    whole = run(flex_screen, "flex_agrupar", por="desfecho", somente_tela=False, medida="tempo_queima_s")
    assert on_screen["registros_na_base"] == 2
    assert whole["registros_na_base"] == 4
    assert "tempo_queima_s_media" in whole["grupos"][0]


def test_record_brings_its_alerts(flex_screen):
    result = run(flex_screen, "flex_ensaio", teste_id="83")
    assert result["registro"]["teste_id"] == "83"
    assert {a["tipo"] for a in result["alertas"]} == {"valor_ausente"}


def test_psi117_comparison_says_whether_model_is_inside_band(use_db):
    screen = Screen(pagina="psi117", titulo="PSI-117", investigacao="PSI-117")
    rows = run(screen, "psi117_comparar", tipo_chama="Chama fria", pressao_atm=0.5)["linhas"]
    assert rows[0]["modelo_na_faixa"] is True
    assert rows[0]["diferenca_mm"] == pytest.approx(1.19 - 1.89)


def test_dictionary_explains_ambiguous_column(flex_screen):
    entry = run(flex_screen, "dicionario", termo="gas_co_rotulo_ambiguo_fracao")
    assert "CO2" in entry["descricao"]
    assert entry["cabecalho_na_fonte"].startswith("CO initial")


# --- Laço contra uma Zyria falsa ----------------------------------------------------------------


def sse(*events):
    return "".join(f"data: {json.dumps(e) if isinstance(e, dict) else e}\n\n" for e in events).encode()


def tool_call_stream():
    call = {
        "index": 0,
        "id": "call_1",
        "type": "function",
        "function": {"name": "flex_agrupar", "arguments": ""},
    }
    return sse(
        {"id": "a", "object": "chat.completion.chunk", "created": 0, "model": "zyria-smart",
         "choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": [call]}}]},
        {"id": "a", "object": "chat.completion.chunk", "created": 0, "model": "zyria-smart",
         "choices": [{"index": 0, "delta": {"tool_calls": [{"index": 0, "function": {"arguments": '{"por": '}}]}}]},
        {"id": "a", "object": "chat.completion.chunk", "created": 0, "model": "zyria-smart",
         "choices": [{"index": 0, "delta": {"tool_calls": [{"index": 0, "function": {"arguments": '"desfecho"}'}}]},
                      "finish_reason": "tool_calls"}]},
        {"zyria": {"custo_zyt": 0.001, "saldo_zyt": 9.9, "tokens_input": 900, "tokens_output": 12}},
        "[DONE]",
    )  # fmt: skip


def answer_stream():
    return sse(
        {"id": "b", "object": "chat.completion.chunk", "created": 0, "model": "zyria-smart",
         "choices": [{"index": 0, "delta": {"content": "Na tela há 2 "}}]},
        {"id": "b", "object": "chat.completion.chunk", "created": 0, "model": "zyria-smart",
         "choices": [{"index": 0, "delta": {"content": "extinções."}, "finish_reason": "stop"}]},
        {"zyria": {"custo_zyt": 0.0004, "saldo_zyt": 9.8, "tokens_input": 1200, "tokens_output": 8}},
        "[DONE]",
    )  # fmt: skip


@pytest.fixture
def fake_zyria():
    """Servidor local no formato da Zyria. `replies` é a fila de respostas; `requests` guarda os corpos."""
    # Catálogo no formato real de GET /models da Zyria: só modelos com "tools" servem ao assistente.
    catalog = [
        {"id": "anthropic/claude-sonnet-5.5", "tipo_modelo": "chat", "capacidades": ["tools", "vision"]},
        {"id": "anthropic/claude-haiku-5.5", "tipo_modelo": "chat", "capacidades": ["tools", "vision"]},
        {"id": "zyria-express", "tipo_modelo": "chat", "capacidades": []},
    ]
    state = {"replies": [], "requests": [], "catalog": catalog}
    provider._catalog.cache_clear()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"object": "list", "data": state["catalog"]}).encode())

        def do_POST(self):  # noqa: N802
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            state["requests"].append({"path": self.path, "auth": self.headers["Authorization"], "body": body})
            status, payload = state["replies"].pop(0)
            self.send_response(status)
            self.send_header("Content-Type", "text/event-stream" if status == 200 else "application/json")
            self.send_header("X-Request-Id", "req_teste")
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    state["config"] = provider.Config(
        f"http://127.0.0.1:{server.server_port}/api/public/v1", "zy_test_x", "anthropic/claude-sonnet-5.5"
    )
    yield state
    server.shutdown()
    provider._catalog.cache_clear()


def test_tool_round_trip_with_the_real_sdk(fake_zyria, flex_screen):
    fake_zyria["replies"] = [(200, tool_call_stream()), (200, answer_stream())]
    history = []
    events = list(agent.answer(flex_screen, history, "Quantas extinções há?", config=fake_zyria["config"]))

    text = "".join(e for e in events if isinstance(e, str))
    uses = [e for e in events if isinstance(e, agent.ToolUse)]
    done = events[-1]
    assert text == "Na tela há 2 extinções."
    assert [u.name for u in uses] == ["flex_agrupar"]
    assert json.loads(uses[0].result)["registros_na_base"] == 2
    assert done.usage["custo_zyt"] == pytest.approx(0.0014) and done.rounds == 2  # soma das duas rodadas
    assert done.usage["saldo_zyt"] == 9.8 and done.usage["tokens_input"] == 2100
    assert [m["role"] for m in history] == ["user", "assistant", "tool", "assistant"]

    first, second = (r["body"] for r in fake_zyria["requests"])
    assert fake_zyria["requests"][0]["path"] == "/api/public/v1/chat/completions"
    assert fake_zyria["requests"][0]["auth"] == "Bearer zy_test_x"
    assert first["zyria_label"] == provider.LABEL and first["stream"] is True
    assert {t["function"]["name"] for t in first["tools"]} == {t.name for t in tools.tools_for("flex")}
    assert "Filtros ativos: desfecho = Extinção" in first["messages"][0]["content"]
    assert second["messages"][-1]["role"] == "tool" and second["messages"][-1]["tool_call_id"] == "call_1"


def test_zyria_error_codes_become_clear_messages(fake_zyria, flex_screen):
    body = json.dumps(
        {"error": {"message": "sem saldo", "code": "insufficient_funds", "request_id": "r"}}
    ).encode()
    fake_zyria["replies"] = [(402, body)]
    with pytest.raises(provider.ProviderError, match="Saldo de Z Token"):
        list(agent.answer(flex_screen, [], "oi", config=fake_zyria["config"]))


def test_missing_configuration_is_explained(flex_screen):
    with pytest.raises(provider.ProviderError, match="ZYRIA_BASE_URL, ZYRIA_API_KEY"):
        list(agent.answer(flex_screen, [], "oi", config=provider.Config(None, None, "zyria-smart")))


def test_history_is_trimmed_only_at_user_boundaries():
    history = []
    for i in range(agent.MAX_HISTORY_TURNS + 3):
        history += [{"role": "user", "content": str(i)}, {"role": "assistant", "content": "", "tool_calls": []},
                    {"role": "tool", "content": "{}"}, {"role": "assistant", "content": "ok"}]  # fmt: skip
    trimmed = agent.trim(history)
    assert trimmed[0]["role"] == "user"
    assert sum(m["role"] == "user" for m in trimmed) == agent.MAX_HISTORY_TURNS


def test_error_sent_mid_stream_becomes_a_message_with_alternatives(fake_zyria, flex_screen):
    """O caso real: HTTP 200 e depois um evento SSE de erro, que o SDK levanta como APIError genérico."""
    error = {"error": {"message": "modelo 'anthropic/claude-sonnet-5.5' não existe ou está inativo"}}
    fake_zyria["replies"] = [(200, sse(error))]
    with pytest.raises(provider.ProviderError) as raised:
        list(agent.answer(flex_screen, [], "oi", config=fake_zyria["config"]))
    assert "não existe ou está inativo" in str(raised.value)
    assert "anthropic/claude-haiku-5.5" in str(raised.value)  # sugere modelos da credencial com tools


@pytest.mark.parametrize("model", ["zyria-smart", "zyria-express"])  # inexistente; existe mas sem tools
def test_unusable_model_is_refused_before_spending(fake_zyria, flex_screen, model):
    config = provider.Config(fake_zyria["config"].base_url, "zy_test_x", model)
    with pytest.raises(provider.ProviderError, match="ZYRIA_MODEL"):
        list(agent.answer(flex_screen, [], "oi", config=config))
    assert fake_zyria["requests"] == []  # nenhuma chamada de chat (cobrada) foi feita
