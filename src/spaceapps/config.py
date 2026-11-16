"""Shared filesystem configuration; independent of the data pipeline."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DADOS = Path(os.environ.get("SPACEAPPS_DADOS", ROOT / "dados"))
DB_PATH = Path(os.environ.get("SPACEAPPS_DB", ROOT / "data" / "zorbital.duckdb"))
