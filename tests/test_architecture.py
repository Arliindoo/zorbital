"""Keep shared definitions and deterministic ingestion independent of workflows."""

import ast
import importlib.util
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "src" / "spaceapps"


@pytest.mark.parametrize(
    ("area", "forbidden"),
    [
        ("datasets", ("api", "studies", "ingest", "evidence", "assistant", "integrations")),
        ("ingest", ("api", "studies", "assistant", "integrations")),
        ("evidence", ("api", "studies", "ingest", "assistant", "integrations")),
    ],
)
def test_backend_dependency_boundaries(area, forbidden):
    violations = []
    prefixes = tuple(f"spaceapps.{name}" for name in forbidden)
    for path in (PACKAGE / area).rglob("*.py"):
        package = ".".join(path.parent.relative_to(PACKAGE.parent).parts)
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            imports = []
            if isinstance(node, ast.Import):
                imports = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                module = importlib.util.resolve_name("." * node.level + (node.module or ""), package)
                imports = [module, *(f"{module}.{alias.name}" for alias in node.names)]
            for name in imports:
                if any(name == prefix or name.startswith(prefix + ".") for prefix in prefixes):
                    violations.append(f"{path.relative_to(ROOT)}:{node.lineno}: {name}")
    assert not violations, "\n".join(violations)


def test_frontend_shared_does_not_import_features():
    source = ROOT / "frontend" / "src"
    forbidden = {"app", "pages", "features", "visualization"}
    violations = []
    for path in (source / "shared").rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".css"}:
            continue
        for ref in re.findall(r"['\"](@/[^'\"]+|\.{1,2}/[^'\"]+)['\"]", path.read_text(encoding="utf-8")):
            target = source / ref[2:] if ref.startswith("@/") else (path.parent / ref).resolve()
            if target.is_relative_to(source) and target.relative_to(source).parts[0] in forbidden:
                violations.append(f"{path.relative_to(ROOT)}: {ref}")
    assert not violations, "\n".join(violations)
