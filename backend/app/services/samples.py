"""新規ゲストに有効なサンプル（idea_ws.sample_contents）を複製する。
サンプル内の key 参照は uuid に振り直す。形式は supabase/seed.sql 先頭のコメントを参照"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from backend.app.db import Conn


async def _insert_returning_id(conn: Conn, sql: str, params: tuple[Any, ...]) -> UUID:
    cur = await conn.execute(sql, params)
    row = await cur.fetchone()
    assert row is not None
    return UUID(str(row["id"]))


async def copy_active_sample(conn: Conn, user_id: UUID) -> UUID | None:
    """呼び出し側のトランザクション内で実行すること。作成したプロジェクトの ID を返す（サンプルが無ければ None）"""
    cur = await conn.execute("select content from idea_ws.sample_contents where is_active")
    row = await cur.fetchone()
    if row is None:
        return None
    sample: dict[str, Any] = row["content"]

    project = sample["project"]
    project_id = await _insert_returning_id(
        conn,
        "insert into idea_ws.projects (user_id, name, description) values (%s, %s, %s) returning id",
        (user_id, project["name"], project.get("description", "")),
    )

    section_ids: dict[str, UUID] = {}
    for s in sample.get("sections", []):
        section_ids[s["key"]] = await _insert_returning_id(
            conn,
            """
            insert into idea_ws.sections (user_id, project_id, name, icon, position)
            values (%s, %s, %s, %s, %s) returning id
            """,
            (user_id, project_id, s["name"], s.get("icon"), s["position"]),
        )

    note_ids: dict[str, UUID] = {}
    for n in sample.get("notes", []):
        note_ids[n["key"]] = await _insert_returning_id(
            conn,
            """
            insert into idea_ws.notes
              (user_id, project_id, section_id, title, content, position, created_at, updated_at)
            values (%s, %s, %s, %s, %s, %s, now() - make_interval(hours => %s), now() - make_interval(hours => %s))
            returning id
            """,
            (
                user_id,
                project_id,
                section_ids[n["sectionKey"]],
                n["title"],
                n["content"],
                n["position"],
                n["createdHoursAgo"],
                n["updatedHoursAgo"],
            ),
        )

    for p in sample.get("prds", []):
        await conn.execute(
            """
            insert into idea_ws.prd_documents
              (user_id, project_id, title, content, generation_mode, detail_level, source_note_ids,
               facts, proposals, open_questions, contradictions, version, created_at, updated_at)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    now() - make_interval(hours => %s), now() - make_interval(hours => %s))
            """,
            (
                user_id,
                project_id,
                p["title"],
                p["content"],
                p["generationMode"],
                p["detailLevel"],
                [note_ids[k] for k in p.get("sourceNoteKeys", []) if k in note_ids],
                Jsonb(p.get("facts", [])),
                Jsonb(p.get("proposals", [])),
                Jsonb(p.get("openQuestions", [])),
                Jsonb(p.get("contradictions", [])),
                p.get("version", 1),
                p["createdHoursAgo"],
                p["updatedHoursAgo"],
            ),
        )

    prefs = sample.get("preferences")
    if prefs:
        panes = [
            {"id": pane["id"], "noteId": str(note_ids[pane["noteKey"]]) if pane.get("noteKey") in note_ids else None}
            for pane in prefs["panes"]
        ]
        await conn.execute(
            """
            insert into idea_ws.workspace_preferences (user_id, project_id, pane_count, panes, active_pane_id)
            values (%s, %s, %s, %s, %s)
            """,
            (user_id, project_id, prefs["paneCount"], Jsonb(panes), prefs["activePaneId"]),
        )

    return project_id
