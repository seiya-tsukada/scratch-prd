"""テスト全体のフィクスチャ。

docker compose の db-test（localhost:54323）に対して、テストセッションの最初に idea_ws を作り直す。

    docker compose up -d db-test
    uv run pytest
"""

from __future__ import annotations

import os

from psycopg.conninfo import make_conninfo

from backend.scripts.db_reset import APP_ROLE, DEFAULT_LOCAL_APP_PASSWORD

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:54323/postgres")
TEST_ORIGIN = "http://localhost:3000"

# アプリの設定は環境変数が .env より優先される。開発者の .env（実際の API キーなど）をテストに持ち込まない
os.environ.update(
    {
        "DATABASE_URL": make_conninfo(TEST_DATABASE_URL, user=APP_ROLE, password=DEFAULT_LOCAL_APP_PASSWORD),
        "SESSION_TOKEN_PEPPER": "test-pepper",
        "ALLOWED_ORIGINS": TEST_ORIGIN,
        "COOKIE_SECURE": "false",
        "TRUST_PROXY_HEADERS": "false",
        "GEMINI_API_KEY": "MY_GEMINI_API_KEY",
        "TURNSTILE_SECRET_KEY": "",
    }
)

# ruff: noqa: E402  環境変数を設定してからアプリを読み込む
from collections.abc import Iterator
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app import config
from backend.app.main import app
from backend.app.services.turnstile import get_turnstile_verifier
from backend.scripts.db_reset import reset_database


class FakeTurnstile:
    def __init__(self, ok: bool = True) -> None:
        self.ok = ok
        self.calls: list[tuple[str, str | None]] = []

    async def verify(self, token: str, remote_ip: str | None) -> bool:
        self.calls.append((token, remote_ip))
        return self.ok


@pytest.fixture(scope="session")
def database_url() -> str:
    try:
        reset_database(TEST_DATABASE_URL)
    except psycopg.OperationalError as e:
        hint = "`docker compose up -d db-test` を実行してください"
        pytest.exit(f"テスト用 DB に接続できません。{hint}: {e}", returncode=1)
    return TEST_DATABASE_URL


@pytest.fixture(scope="session")
def app_database_url(database_url: str) -> str:
    return make_conninfo(database_url, user=APP_ROLE, password=DEFAULT_LOCAL_APP_PASSWORD)


@pytest.fixture
def db_admin(database_url: str) -> Iterator[psycopg.Connection[Any]]:
    """API テストの検証用（postgres ロール・autocommit）。終了時に API が作ったデータを消す"""
    with psycopg.connect(database_url, autocommit=True) as conn:
        yield conn
        for table in ["users", "rate_limit_buckets", "events", "ai_generations", "email_login_tokens", "oauth_states"]:
            conn.execute(f"delete from idea_ws.{table}")


@pytest.fixture
def turnstile() -> FakeTurnstile:
    return FakeTurnstile()


@pytest.fixture
def client(db_admin: psycopg.Connection[Any], turnstile: FakeTurnstile) -> Iterator[TestClient]:
    """ログインしていないクライアント（Origin は許可済み）"""
    config.get_settings.cache_clear()
    app.dependency_overrides[get_turnstile_verifier] = lambda: turnstile
    with TestClient(app, headers={"Origin": TEST_ORIGIN}) as c:
        yield c
    app.dependency_overrides.clear()
    config.get_settings.cache_clear()


def login_guest(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/auth/guest", json={"turnstileToken": "token"})
    assert response.status_code == 200, response.text
    user: dict[str, Any] = response.json()["user"]
    return user


@pytest.fixture
def guest_client(client: TestClient) -> TestClient:
    """ゲストとしてログイン済みのクライアント"""
    login_guest(client)
    return client


@pytest.fixture
def other_guest_client(client: TestClient) -> Iterator[TestClient]:
    """別のゲストとしてログイン済みのクライアント（Cookie は guest_client と別）"""
    with TestClient(app, headers={"Origin": TEST_ORIGIN}) as other:
        login_guest(other)
        yield other
