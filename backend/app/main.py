"""FastAPI アプリ。ローカルは `npm run dev:api`（画面は Vite が配信）。
本番は Vercel の FastAPI として /api/* を受け、ビルド済みの画面（dist/）も配信する"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from psycopg import errors as pg_errors

from backend.app import config
from backend.app.db import create_pool
from backend.app.routers import account, ai, auth, cron, events, workspace
from backend.app.services.workspace_repo import ConflictError, LimitExceededError, NotFoundError


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    pool = create_pool(config.get_settings().database_url)
    await pool.open()
    app.state.pool = pool
    try:
        yield
    finally:
        await pool.close()


app = FastAPI(title="Idea Workspace API", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


# 画面は自分のオリジンと Cloudflare Turnstile だけを読み込む
CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self' https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "connect-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


@app.middleware("http")
async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    response = await call_next(request)
    response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if config.get_settings().cookie_secure:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.middleware("http")
async def limit_request_size(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    content_length = request.headers.get("content-length")
    limit = config.IMPORT_MAX_REQUEST_BYTES if request.url.path == config.IMPORT_PATH else config.MAX_REQUEST_BYTES
    if content_length and content_length.isdigit() and int(content_length) > limit:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


# 他人のリソース・存在しないリソースは区別せず 404（存在を漏らさない）
@app.exception_handler(NotFoundError)
@app.exception_handler(pg_errors.ForeignKeyViolation)
async def not_found(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": {"code": "not_found"}})


@app.exception_handler(ConflictError)
async def conflict(request: Request, exc: ConflictError) -> JSONResponse:
    note = exc.current.model_dump(by_alias=True, mode="json")
    return JSONResponse(status_code=409, content={"detail": {"code": "conflict", "note": note}})


@app.exception_handler(LimitExceededError)
async def limit_exceeded(request: Request, exc: LimitExceededError) -> JSONResponse:
    detail = {"code": "limit_exceeded", "resource": exc.resource, "limit": exc.limit}
    return JSONResponse(status_code=422, content={"detail": detail})


app.include_router(auth.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(cron.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(events.router, prefix="/api")

# ビルド済みの画面を配信する（API のルートが常に優先され、画面の URL を直接開いたときは index.html を返す）
if config.DIST_DIR.is_dir():
    app.frontend("/", directory=config.DIST_DIR)
