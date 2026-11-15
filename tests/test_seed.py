"""Seed: o banco pode ser montado só a partir de seed/, sem a pasta dados/."""

import duckdb
from fastapi.testclient import TestClient

from spaceapps import db
from spaceapps.api.app import create_app
from spaceapps.ingest import seed


def tables(path):
    with duckdb.connect(str(path), read_only=True) as con:
        return {
            r[0]: r[1]
            for r in con.sql("SELECT table_name, table_type FROM information_schema.tables").fetchall()
        }


def test_seed_round_trip_rebuilds_tables_and_views(built_db, tmp_path):
    folder = tmp_path / "seed"
    assert seed.export(built_db, folder)  # primeira vez: todas as tabelas
    rebuilt = tmp_path / "novo.duckdb"
    counts = seed.load(folder, rebuilt)

    original, copy = tables(built_db), tables(rebuilt)
    assert set(original) == set(copy)  # tabelas e visões (estas recriadas pelo código)
    assert copy["v_extincao_c12_comparacao"] == "VIEW"
    with duckdb.connect(str(rebuilt), read_only=True) as con:
        assert con.sql("SELECT count(*) FROM cfi_ensaios").fetchall()[0][0] == counts["cfi_ensaios"] == 5


def test_export_is_stable_when_data_does_not_change(built_db, tmp_path):
    folder = tmp_path / "seed"
    seed.export(built_db, folder)
    before = {p.name: p.read_bytes() for p in folder.iterdir()}
    assert seed.export(built_db, folder) == []  # nada mudou: nada é regravado
    assert {p.name: p.read_bytes() for p in folder.iterdir()} == before


def test_seed_has_no_local_paths(built_db, tmp_path):
    folder = tmp_path / "seed"
    seed.export(built_db, folder)
    manifest = (folder / "manifest.json").read_text()
    assert str(tmp_path) not in manifest and "pasta_dados" not in manifest
    assert not (folder / "meta.parquet").exists()


def test_app_builds_the_database_from_the_seed_on_first_open(built_db, tmp_path, monkeypatch):
    """O caso de quem acabou de clonar: sem dados/ e sem banco, só a seed versionada."""
    folder = tmp_path / "seed"
    seed.export(built_db, folder)
    fresh = tmp_path / "data" / "zorbital.duckdb"
    monkeypatch.setattr(db, "DB_PATH", fresh)
    monkeypatch.setattr(seed, "SEED_DIR", folder)

    with TestClient(create_app()) as client:  # a montagem acontece ao subir o servidor
        overview = client.get("/api/overview")

    assert fresh.exists()
    assert overview.status_code == 200
    assert {c["id"] for c in overview.json()["investigacoes"]} >= {"PSI-69", "PSI-117"}
