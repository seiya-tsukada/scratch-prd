"""seed.sql: src/config/seed.ts の内容が sample_contents に入っている"""

from __future__ import annotations

from typing import Any

import psycopg

from backend.scripts.db_reset import SEED_FILE


def active_sample(conn: psycopg.Connection) -> dict[str, Any]:
    row = conn.execute("select content from idea_ws.sample_contents where is_active").fetchone()
    assert row is not None
    content: dict[str, Any] = row[0]
    return content


def test_sample_content_shape(app: psycopg.Connection) -> None:
    sample = active_sample(app)

    assert sample["project"]["name"] == "Idea Workspace (思考からPRDへ)"
    assert "sections" not in sample
    assert len(sample["notes"]) == 5
    assert len(sample["prds"]) == 1
    assert sample["preferences"]["paneCount"] == 2


def test_sample_content_references_are_consistent(app: psycopg.Connection) -> None:
    sample = active_sample(app)
    note_keys = {n["key"] for n in sample["notes"]}

    assert len(note_keys) == len(sample["notes"])
    assert all("sectionKey" not in n for n in sample["notes"])
    assert all(k in note_keys for p in sample["prds"] for k in p["sourceNoteKeys"])
    assert all(p["noteKey"] is None or p["noteKey"] in note_keys for p in sample["preferences"]["panes"])
    assert all(n["updatedHoursAgo"] <= n["createdHoursAgo"] for n in sample["notes"])


def test_seed_is_idempotent(admin: psycopg.Connection) -> None:
    admin.execute(SEED_FILE.read_text(encoding="utf-8").encode())
    assert admin.execute("select count(*) from idea_ws.sample_contents").fetchone() == (1,)
