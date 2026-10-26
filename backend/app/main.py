"""FastAPI アプリ。ローカルは `npm run dev:api`、本番は Vercel Function として /api/* を受ける"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from backend.app import config
from backend.app.routers import ai

app = FastAPI(title="Idea Workspace API", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def limit_request_size(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > config.MAX_REQUEST_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


app.include_router(ai.router, prefix="/api")
