"""DB テストでデータを作るヘルパー"""

from __future__ import annotations

from uuid import UUID

import psycopg


def create_user(conn: psycopg.Connection, *, is_guest: bool = True, email: str | None = None) -> UUID:
    row = conn.execute(
        "insert into idea_ws.users (is_guest, email) values (%s, %s) returning id", (is_guest, email)
    ).fetchone()
    assert row is not None
    return UUID(str(row[0]))


def create_project(conn: psycopg.Connection, user_id: UUID, name: str = "P") -> UUID:
    row = conn.execute(
        "insert into idea_ws.projects (user_id, name) values (%s, %s) returning id", (user_id, name)
    ).fetchone()
    assert row is not None
    return UUID(str(row[0]))


def create_section(conn: psycopg.Connection, user_id: UUID, project_id: UUID, name: str = "S") -> UUID:
    row = conn.execute(
        "insert into idea_ws.sections (user_id, project_id, name) values (%s, %s, %s) returning id",
        (user_id, project_id, name),
    ).fetchone()
    assert row is not None
    return UUID(str(row[0]))
