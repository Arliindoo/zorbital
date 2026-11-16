"""Aplicação FastAPI: API do painel e, em produção, os arquivos do front-end (`frontend/dist`)."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .. import db
from ..config import ROOT
from . import chat, pages, studies, uploads

log = logging.getLogger(__name__)
DIST = Path(os.environ.get("SPACEAPPS_DIST", ROOT / "frontend" / "dist"))


def ensure_db() -> None:
    """Sem banco, monta a partir da seed versionada (primeira abertura de quem clonou o repositório)."""
    if db.exists():
        return
    from ..ingest import seed

    if not seed.exists():
        raise RuntimeError(
            "O banco ainda não foi gerado e não há seed no repositório: rode `uv run spaceapps-build`."
        )
    log.info("Montando o banco a partir da seed…")
    seed.load(db_path=db.DB_PATH)


@asynccontextmanager
async def lifespan(_: FastAPI):
    dotenv.load_dotenv()  # pelo módulo, para os testes conseguirem trocar a função e nunca ler o .env real
    ensure_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Zorbital", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(GZipMiddleware, minimum_size=2048)
    app.include_router(pages.router)
    app.include_router(studies.router)
    app.include_router(uploads.router)
    app.include_router(chat.router)

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "banco": db.exists()}

    if DIST.is_dir():
        # build de produção: arquivos com hash em /assets e o index.html para qualquer rota do React Router
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            if path.startswith("api/"):
                raise HTTPException(404)
            file = (DIST / path).resolve()
            if path and file.is_file() and file.is_relative_to(DIST.resolve()):
                return FileResponse(file)
            return FileResponse(DIST / "index.html")

    return app


app = create_app()


def main() -> None:
    """`uv run spaceapps-serve`: sobe a API (e o front já compilado) em http://localhost:8000."""
    import uvicorn

    uvicorn.run(
        "spaceapps.api.app:app",
        host=os.environ.get("SPACEAPPS_HOST", "127.0.0.1"),
        port=int(os.environ.get("SPACEAPPS_PORT", "8000")),
        reload=os.environ.get("SPACEAPPS_RELOAD") == "1",
    )
