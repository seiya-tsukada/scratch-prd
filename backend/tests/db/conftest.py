"""DB テスト用のフィクスチャ。各テストはトランザクション内で実行し、終了時にロールバックする。
テスト用 DB の作り直しは backend/tests/conftest.py の database_url が行う"""

from __future__ import annotations

from collections.abc import Iterator

import psycopg
import pytest


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
