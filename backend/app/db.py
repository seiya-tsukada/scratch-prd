"""DB 接続。Supavisor の transaction mode ではプリペアドステートメントが使えないため無効にする。
接続は autocommit。複数の文をまとめるときは `async with conn.transaction():` を使う。
外部 API（Gemini など）を待つ処理では Db ではなく Pool を受け取り、接続は DB を使う間だけ借りること"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import Depends, Request
from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

POOL_MAX_SIZE = 5

Conn = AsyncConnection[DictRow]


def create_pool(database_url: str) -> AsyncConnectionPool[Conn]:
    kwargs: dict[str, Any] = {"autocommit": True, "prepare_threshold": None, "row_factory": dict_row}
    return AsyncConnectionPool(
        database_url,
        connection_class=AsyncConnection[DictRow],
        kwargs=kwargs,
        min_size=0,
        max_size=POOL_MAX_SIZE,
        open=False,
        check=AsyncConnectionPool.check_connection,
    )


def get_pool(request: Request) -> AsyncConnectionPool[Conn]:
    pool: AsyncConnectionPool[Conn] = request.app.state.pool
    return pool


Pool = Annotated[AsyncConnectionPool[Conn], Depends(get_pool)]


async def get_db(pool: Pool) -> AsyncIterator[Conn]:
    """リクエストの間ずっと 1 本の接続を使う（DB だけで完結するエンドポイント向け）"""
    async with pool.connection() as conn:
        yield conn


Db = Annotated[Conn, Depends(get_db)]
