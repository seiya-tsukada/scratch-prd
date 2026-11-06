"""マイグレーション 20261107000001（セクションの廃止）: 旧データの変換

適用済みの DB は巻き戻せないため、使い捨てのデータベースを作り、
1 つ前のマイグレーションまで適用 → 旧形式のデータを入れる → 対象のマイグレーションを適用、の順で確かめる。
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.types.json import Jsonb

from backend.scripts.db_reset import migration_files

TARGET_MIGRATION = "20261107000001_idea_ws_remove_sections.sql"


def split_migrations() -> tuple[list[Path], Path]:
    files = migration_files()
    names = [f.name for f in files]
    index = names.index(TARGET_MIGRATION)
    return files[:index], files[index]


def apply(conn: psycopg.Connection[Any], path: Path) -> None:
    # db_reset と同じく、ファイル単位でトランザクションにする
    with conn.transaction():
        conn.execute(path.read_text(encoding="utf-8").encode())


@pytest.fixture
def scratch_db(database_url: str) -> Iterator[psycopg.Connection[Any]]:
    """1 つ前のマイグレーションまで適用した使い捨てのデータベース（postgres ロール・autocommit）"""
    name = f"idea_ws_migration_{uuid4().hex[:12]}"
    with psycopg.connect(database_url, autocommit=True) as server:
        server.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    try:
        with psycopg.connect(make_conninfo(database_url, dbname=name), autocommit=True) as conn:
            # Supabase の postgres データベースには最初からある（新しいデータベースには無い）
            conn.execute("create schema if not exists extensions")
            before, _ = split_migrations()
            for path in before:
                apply(conn, path)
            yield conn
    finally:
        with psycopg.connect(database_url, autocommit=True) as server:
            server.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))


def insert_id(conn: psycopg.Connection[Any], query: str, params: tuple[Any, ...]) -> UUID:
    row = conn.execute(query, params).fetchone()
    assert row is not None
    return UUID(str(row[0]))


def test_prd_section_notes_become_prds(scratch_db: psycopg.Connection[Any]) -> None:
    conn = scratch_db
    user = insert_id(conn, "insert into idea_ws.users (is_guest) values (true) returning id", ())
    project = insert_id(conn, "insert into idea_ws.projects (user_id, name) values (%s, 'P') returning id", (user,))

    def section(name: str) -> UUID:
        return insert_id(
            conn,
            "insert into idea_ws.sections (user_id, project_id, name) values (%s, %s, %s) returning id",
            (user, project, name),
        )

    def note(section_id: UUID, title: str, content: str) -> UUID:
        return insert_id(
            conn,
            "insert into idea_ws.notes (user_id, project_id, section_id, title, content, created_at, updated_at) "
            "values (%s, %s, %s, %s, %s, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z') returning id",
            (user, project, section_id, title, content),
        )

    inbox = section("Inbox (思いつき)")
    prd_section = section("PRD (生成された仕様書)")
    lower_prd_section = section("  prd メモ")
    not_prd_section = section("My PRD ideas")  # 先頭が PRD ではない

    kept_note = note(inbox, "アイデア", "本文")
    kept_note_2 = note(not_prd_section, "", "PRD の素材")
    titled = note(prd_section, "仕様書 v1", "# 見出し\n本文")
    note(prd_section, "  ", "## 本文の見出し\n続き")
    note(lower_prd_section, "", "")
    note(prd_section, "あ" * 250, "x")

    conn.execute(
        "insert into idea_ws.workspace_preferences (user_id, project_id, pane_count, panes, active_pane_id) "
        "values (%s, %s, 3, %s, 'pane-0')",
        (
            user,
            project,
            Jsonb(
                [
                    {"id": "pane-0", "noteId": str(kept_note)},
                    {"id": "pane-1", "noteId": str(titled)},
                    {"id": "pane-2", "noteId": None},
                ]
            ),
        ),
    )
    conn.execute(
        "insert into idea_ws.sample_contents (version, is_active, content) values (1, true, %s)",
        (
            Jsonb(
                {
                    "project": {"name": "S"},
                    "sections": [{"key": "inbox", "name": "Inbox"}],
                    "notes": [{"key": "n1", "sectionKey": "inbox", "title": "T"}],
                    "prds": [],
                }
            ),
        ),
    )

    _, target = split_migrations()
    apply(conn, target)

    notes = conn.execute("select id from idea_ws.notes where user_id = %s", (user,)).fetchall()
    assert {UUID(str(r[0])) for r in notes} == {kept_note, kept_note_2}

    prds = conn.execute(
        "select title, content, generation_mode, source_note_ids, project_id, created_at, updated_at "
        "from idea_ws.prd_documents where user_id = %s",
        (user,),
    ).fetchall()
    by_content = {r[1]: r for r in prds}
    assert len(prds) == 4
    assert {r[0] for r in prds} == {"仕様書 v1", "本文の見出し", "無題のPRD", "あ" * 200}
    assert by_content["# 見出し\n本文"][0] == "仕様書 v1"
    assert by_content[""][0] == "無題のPRD"
    assert all(r[2] == "unknown" and r[3] == [] and UUID(str(r[4])) == project for r in prds)
    # 作成・更新日時はメモのものを引き継ぐ
    created, updated = datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 2, tzinfo=UTC)
    assert all(r[5] == created and r[6] == updated for r in prds)

    panes = conn.execute("select panes from idea_ws.workspace_preferences where user_id = %s", (user,)).fetchone()
    assert panes is not None
    assert panes[0] == [
        {"id": "pane-0", "noteId": str(kept_note)},
        {"id": "pane-1", "noteId": None},
        {"id": "pane-2", "noteId": None},
    ]

    sample = conn.execute("select content from idea_ws.sample_contents where is_active").fetchone()
    assert sample is not None
    assert sample[0] == {"project": {"name": "S"}, "notes": [{"key": "n1", "title": "T"}], "prds": []}

    tables = conn.execute(
        "select table_name from information_schema.tables "
        "where table_schema = 'idea_ws' and table_name in ('sections', 'section_templates')"
    ).fetchall()
    assert tables == []
    column = conn.execute(
        "select 1 from information_schema.columns "
        "where table_schema = 'idea_ws' and table_name = 'notes' and column_name = 'section_id'"
    ).fetchone()
    assert column is None
