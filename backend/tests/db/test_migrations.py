"""マイグレーション（supabase/migrations/*.sql）の冪等性

使い捨てのデータベースに 1 回適用 → データを入れる → もう 1 回適用し、
スキーマ（テーブル・列・制約・インデックス・ポリシー・トリガー・権限）とデータが変わらないことを確かめる。
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from backend.scripts.db_migrate import apply_all, migration_files

# 日付入りの名前（Supabase CLI 形式）にしない。名前順に適用する
MIGRATION_NAME = re.compile(r"^[a-z][a-z0-9_]*\.sql$")

SCHEMA_SNAPSHOT_QUERIES = {
    "columns": """
        select table_name, column_name, data_type, is_nullable, column_default
        from information_schema.columns where table_schema = 'idea_ws'
        order by 1, 2
    """,
    "constraints": """
        select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
        from pg_constraint where connamespace = 'idea_ws'::regnamespace
        order by 1, 2
    """,
    "indexes": "select indexname, indexdef from pg_indexes where schemaname = 'idea_ws' order by 1",
    "policies": """
        select tablename, policyname, roles::text, cmd, qual, with_check
        from pg_policies where schemaname = 'idea_ws' order by 1, 2
    """,
    "triggers": """
        select tgrelid::regclass::text, tgname, pg_get_triggerdef(oid)
        from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'idea_ws.%'
        order by 1, 2
    """,
    "rls": """
        select relname, relrowsecurity from pg_class
        where relnamespace = 'idea_ws'::regnamespace and relkind = 'r' order by 1
    """,
    "table_grants": """
        select table_name, grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'idea_ws' order by 1, 2, 3
    """,
    "functions": """
        select p.proname, pg_get_function_identity_arguments(p.oid), p.proacl::text
        from pg_proc p where p.pronamespace = 'idea_ws'::regnamespace order by 1, 2
    """,
}


def snapshot(conn: psycopg.Connection[Any]) -> dict[str, list[tuple[Any, ...]]]:
    return {name: conn.execute(query).fetchall() for name, query in SCHEMA_SNAPSHOT_QUERIES.items()}


@pytest.fixture
def scratch_db(database_url: str) -> Iterator[psycopg.Connection[Any]]:
    """空の使い捨てデータベース（postgres ロール・autocommit）"""
    name = f"idea_ws_migration_{uuid4().hex[:12]}"
    with psycopg.connect(database_url, autocommit=True) as server:
        server.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    try:
        with psycopg.connect(make_conninfo(database_url, dbname=name), autocommit=True) as conn:
            # Supabase の postgres データベースには最初からある（新しいデータベースには無い）
            conn.execute("create schema if not exists extensions")
            yield conn
    finally:
        with psycopg.connect(database_url, autocommit=True) as server:
            server.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))


def test_migration_file_names_have_no_dates() -> None:
    names = [f.name for f in migration_files()]
    assert names, "supabase/migrations/ にマイグレーションがありません"
    assert all(MIGRATION_NAME.match(n) for n in names), names


def test_migrations_are_idempotent(scratch_db: psycopg.Connection[Any]) -> None:
    conn = scratch_db
    apply_all(conn)
    first = snapshot(conn)
    assert first["columns"], "idea_ws にテーブルがありません"

    user = conn.execute("insert into idea_ws.users (is_guest) values (true) returning id").fetchone()
    assert user is not None
    project = conn.execute(
        "insert into idea_ws.projects (user_id, name) values (%s, 'P') returning id", (user[0],)
    ).fetchone()
    assert project is not None
    conn.execute(
        "insert into idea_ws.notes (user_id, project_id, title, content) values (%s, %s, 'T', 'C')",
        (user[0], project[0]),
    )

    # 2 回目（seed も含む）でエラーにならず、スキーマもデータも変わらない
    apply_all(conn)
    assert snapshot(conn) == first
    assert conn.execute("select count(*) from idea_ws.notes").fetchone() == (1,)
    assert conn.execute("select count(*) from idea_ws.sample_contents").fetchone() == (1,)
