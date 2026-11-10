"""/api/health: DB へ select 1 を投げて接続を確認する"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi.testclient import TestClient

from backend.app.db import get_pool
from backend.app.main import app


def test_health_checks_db(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"


class BrokenPool:
    """接続を借りようとすると失敗するプール"""

    @asynccontextmanager
    async def connection(self, timeout: float | None = None) -> AsyncIterator[Any]:
        raise OSError("connection refused: postgresql://secret@db")
        yield


def test_health_returns_503_when_db_is_down(client: TestClient) -> None:
    app.dependency_overrides[get_pool] = lambda: BrokenPool()
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "db": "unavailable"}
    # 接続文字列などの詳細は応答に含めない
    assert "secret" not in response.text
