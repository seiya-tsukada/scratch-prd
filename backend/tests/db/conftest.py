"""DB テスト用のフィクスチャ。

docker compose の db-test（localhost:54323）に対して、テストセッションの最初に idea_ws を作り直す。
各テストはトランザクション内で実行し、終了時にロールバックする。

    docker compose up -d db-test
    uv run pytest
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

from backend.scripts.db_reset import APP_ROLE, DEFAULT_LOCAL_APP_PASSWORD, reset_database

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:54323/postgres")


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
def admin(database_url: str) -> Iterator[psycopg.Connection]:
    """postgres ロール（マイグレーションを実行するロール）の接続。テスト終了時にロールバック"""
    with psycopg.connect(database_url) as conn:
        yield conn
        conn.rollback()


@pytest.fixture
def app(app_database_url: str) -> Iterator[psycopg.Connection]:
    """バックエンドが使う idea_ws_app ロールの接続。テスト終了時にロールバック"""
    with psycopg.connect(app_database_url) as conn:
        yield conn
        conn.rollback()
