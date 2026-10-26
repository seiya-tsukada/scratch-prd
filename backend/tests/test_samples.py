"""ゲスト作成時のサンプル複製"""

from __future__ import annotations

from typing import Any

import psycopg
from fastapi.testclient import TestClient

from .conftest import login_guest


def test_guest_gets_a_copy_of_the_active_sample(client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    user_id = login_guest(client)["id"]
    sample = db_admin.execute("select content from idea_ws.sample_contents where is_active").fetchone()
    assert sample is not None
    content = sample[0]

    def count(table: str) -> int:
        row = db_admin.execute(f"select count(*) from idea_ws.{table} where user_id = %s", (user_id,)).fetchone()
        assert row is not None
        return int(row[0])

    assert count("projects") == 1
    assert count("sections") == len(content["sections"])
    assert count("notes") == len(content["notes"])
    assert count("prd_documents") == len(content["prds"])
    assert count("workspace_preferences") == 1

    # 日時はサンプルの相対値（何時間前）から作る
    note = db_admin.execute(
        "select round(extract(epoch from now() - updated_at) / 3600) from idea_ws.notes "
        "where user_id = %s and title = %s",
        (user_id, content["notes"][0]["title"]),
    ).fetchone()
    assert note == (content["notes"][0]["updatedHoursAgo"],)


def test_sample_references_are_remapped_to_new_ids(client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    user_id = login_guest(client)["id"]
    note_ids = {str(r[0]) for r in db_admin.execute("select id from idea_ws.notes where user_id = %s", (user_id,))}

    [(source_note_ids,)] = db_admin.execute(
        "select source_note_ids from idea_ws.prd_documents where user_id = %s", (user_id,)
    ).fetchall()
    assert source_note_ids and {str(i) for i in source_note_ids} <= note_ids

    [(panes, active_pane_id)] = db_admin.execute(
        "select panes, active_pane_id from idea_ws.workspace_preferences where user_id = %s", (user_id,)
    ).fetchall()
    assigned = [p["noteId"] for p in panes if p["noteId"]]
    assert assigned and set(assigned) <= note_ids
    assert active_pane_id == "pane-0"


def test_each_guest_gets_independent_copies(client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    first = login_guest(client)["id"]
    client.cookies.clear()
    second = login_guest(client)["id"]

    assert first != second
    shared = db_admin.execute(
        "select count(*) from idea_ws.notes a join idea_ws.notes b on a.id = b.id "
        "where a.user_id = %s and b.user_id = %s",
        (first, second),
    ).fetchone()
    assert shared == (0,)


def test_guest_creation_without_active_sample_still_works(
    client: TestClient, db_admin: psycopg.Connection[Any]
) -> None:
    db_admin.execute("update idea_ws.sample_contents set is_active = false")
    try:
        user_id = login_guest(client)["id"]
        assert db_admin.execute("select count(*) from idea_ws.projects where user_id = %s", (user_id,)).fetchone() == (
            0,
        )
    finally:
        db_admin.execute("update idea_ws.sample_contents set is_active = true where version = 1")
