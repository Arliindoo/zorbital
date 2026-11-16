"""Deterministic validation of reviewed document fact sheets."""

from .vocabulary import ATRIBUTOS, GRANDEZAS

FICHA_FILE = "ficha.json"
CONDITION_ATTRS = [a for a in ATRIBUTOS if a != "medicao"]


def items(ficha: dict | None) -> list[tuple[str, dict]]:
    """(tipo, item) de todos os itens com evidência: objetivo, sensores e condições."""
    ficha = ficha or {}
    out = [("objetivo", ficha["objetivo"])] if ficha.get("objetivo") else []
    out += [("sensor", s) for s in ficha.get("sensores") or []]
    out += [("condicao", c) for c in ficha.get("condicoes") or []]
    return out


def validate(ficha: dict | None, *, stored: bool = False) -> list[str]:
    """Problemas nos itens que vão entrar na ficha (os marcados na revisão). Item desmarcado não entra e
    não é problema; numa ficha já gravada (`stored`), todo item precisa ter sido marcado."""
    problems = []
    for kind, item in items(ficha):
        label = {"objetivo": "Objetivo", "sensor": f"Sensor '{item.get('nome')}'",
                 "condicao": f"Condição '{item.get('atributo')}'"}[kind]  # fmt: skip
        if not item.get("confirmado"):
            if stored:
                problems.append(f"Ficha, {label}: não confirmada na revisão.")
            continue
        evidence = item.get("evidencia") or {}
        if not (evidence.get("arquivo") and evidence.get("trecho")):
            problems.append(f"Ficha, {label}: falta arquivo ou trecho da evidência.")
        if kind == "condicao":
            if item.get("atributo") not in CONDITION_ATTRS:
                problems.append(f"Ficha, {label}: atributo fora do vocabulário.")
            low, high = item.get("minimo"), item.get("maximo")
            if low is not None and high is not None and low > high:
                problems.append(f"Ficha, {label}: mínimo maior que o máximo.")
        if kind == "sensor" and item.get("grandeza") and item["grandeza"] not in GRANDEZAS:
            problems.append(f"Ficha, {label}: grandeza fora do vocabulário.")
    return problems


def accepted(ficha: dict | None) -> dict:
    """Só os itens marcados para entrar na ficha (é o que se grava)."""
    ficha = ficha or {}
    goal = ficha.get("objetivo")
    return {
        "objetivo": goal if goal and goal.get("confirmado") else None,
        "sensores": [s for s in ficha.get("sensores") or [] if s.get("confirmado")],
        "condicoes": [c for c in ficha.get("condicoes") or [] if c.get("confirmado")],
    }


def pending(ficha: dict | None) -> int:
    """Itens desmarcados (não vão ser gravados)."""
    return sum(1 for _, item in items(ficha) if not item.get("confirmado"))
