"""旧 localStorage データ（1 プロジェクト分）を取り込む。

旧 ID はすべて新しい uuid に振り直し、次の参照も書き換える:
  メモの sectionId / PRD の sourceNoteIds・facts[].sourceNoteId・contradictions[].notesInvolved・versions[] /
  ペインの noteId。見つからないセクションを指すメモは先頭のセクションに入れる。
作成・更新日時は旧データの値を引き継ぐ（無ければ現在時刻）。
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from backend.app import config
from backend.app.db import Conn
from backend.app.models.workspace import ImportResult, LegacyPrdBody, LegacyProjectImport
from backend.app.services.workspace_repo import LimitExceededError, create_sections_from_templates


async def _insert_id(conn: Conn, query: str, params: tuple[Any, ...]) -> UUID:
    cur = await conn.execute(query, params)
    row = await cur.fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def _remap_prd_body(body: LegacyPrdBody, note_ids: dict[str, UUID]) -> dict[str, Any]:
    """jsonb に保存する形（camelCase）で、旧メモ ID を新しい ID に書き換える"""
    dumped = body.model_dump(by_alias=True, exclude_none=True, mode="json")
    for fact in dumped["facts"]:
        old = fact.get("sourceNoteId")
        if old is not None:
            new = note_ids.get(old)
            if new is None:
                fact.pop("sourceNoteId")
            else:
                fact["sourceNoteId"] = str(new)
    for contradiction in dumped["contradictions"]:
        contradiction["notesInvolved"] = [str(note_ids.get(n, n)) for n in contradiction["notesInvolved"]]
    return {
        "source_note_ids": [note_ids[n] for n in body.source_note_ids if n in note_ids],
        "facts": Jsonb(dumped["facts"]),
        "proposals": Jsonb(dumped["proposals"]),
        "open_questions": Jsonb(dumped["openQuestions"]),
        "contradictions": Jsonb(dumped["contradictions"]),
    }


async def import_legacy_project(conn: Conn, user_id: UUID, data: LegacyProjectImport) -> ImportResult:
    cur = await conn.execute("select count(*) from idea_ws.projects where user_id = %s", (user_id,))
    row = await cur.fetchone()
    if row and row["count"] >= config.MAX_PROJECTS_PER_USER:
        raise LimitExceededError("projects", config.MAX_PROJECTS_PER_USER)

    async with conn.transaction():
        p = data.project
        project_id = await _insert_id(
            conn,
            """
            insert into idea_ws.projects (user_id, name, description, created_at, updated_at)
            values (%s, %s, %s, coalesce(%s, now()), coalesce(%s, now())) returning id
            """,
            (user_id, p.name, p.description, p.created_at, p.updated_at),
        )

        section_ids: dict[str, UUID] = {}
        for s in sorted(data.sections, key=lambda s: s.position):
            section_ids[s.id] = await _insert_id(
                conn,
                """
                insert into idea_ws.sections (user_id, project_id, name, icon, position, created_at, updated_at)
                values (%s, %s, %s, %s, %s, coalesce(%s, now()), coalesce(%s, now())) returning id
                """,
                (user_id, project_id, s.name, s.icon, len(section_ids), s.created_at, s.updated_at),
            )
        if not section_ids and data.notes:
            await create_sections_from_templates(conn, user_id, project_id)
        cur = await conn.execute(
            "select id from idea_ws.sections where user_id = %s and project_id = %s order by position limit 1",
            (user_id, project_id),
        )
        first = await cur.fetchone()
        fallback_section = UUID(str(first["id"])) if first else None

        note_ids: dict[str, UUID] = {}
        for n in data.notes:
            section_id = section_ids.get(n.section_id, fallback_section)
            assert section_id is not None
            note_ids[n.id] = await _insert_id(
                conn,
                """
                insert into idea_ws.notes
                  (user_id, project_id, section_id, title, content, position, created_at, updated_at)
                values (%s, %s, %s, %s, %s, %s, coalesce(%s, now()), coalesce(%s, now())) returning id
                """,
                (user_id, project_id, section_id, n.title, n.content, n.position, n.created_at, n.updated_at),
            )

        for prd in data.prds:
            body = _remap_prd_body(prd, note_ids)
            prd_id = await _insert_id(
                conn,
                """
                insert into idea_ws.prd_documents
                  (user_id, project_id, title, content, generation_mode, detail_level, source_note_ids,
                   facts, proposals, open_questions, contradictions, version, created_at, updated_at)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, now()), coalesce(%s, now()))
                returning id
                """,
                (
                    user_id,
                    project_id,
                    prd.title,
                    prd.content,
                    prd.generation_mode,
                    prd.detail_level,
                    body["source_note_ids"],
                    body["facts"],
                    body["proposals"],
                    body["open_questions"],
                    body["contradictions"],
                    prd.version,
                    prd.created_at,
                    prd.updated_at,
                ),
            )
            seen_versions: set[int] = set()
            for v in prd.versions:
                if v.version_number in seen_versions:
                    continue
                seen_versions.add(v.version_number)
                version_body = _remap_prd_body(v, note_ids)
                await conn.execute(
                    """
                    insert into idea_ws.prd_versions
                      (user_id, prd_document_id, version_number, title, content, generation_mode, detail_level,
                       source_note_ids, facts, proposals, open_questions, contradictions, summary, created_at)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, now()))
                    """,
                    (
                        user_id,
                        prd_id,
                        v.version_number,
                        v.title,
                        v.content,
                        v.generation_mode,
                        v.detail_level,
                        version_body["source_note_ids"],
                        version_body["facts"],
                        version_body["proposals"],
                        version_body["open_questions"],
                        version_body["contradictions"],
                        v.summary,
                        v.created_at,
                    ),
                )

        prefs = data.preferences
        if prefs is not None:
            panes = [
                {"id": pane.id, "noteId": str(note_ids[pane.note_id]) if pane.note_id in note_ids else None}
                for pane in prefs.panes
            ]
            await conn.execute(
                """
                insert into idea_ws.workspace_preferences (user_id, project_id, pane_count, panes, active_pane_id)
                values (%s, %s, %s, %s, %s)
                """,
                (user_id, project_id, prefs.pane_count, Jsonb(panes), prefs.active_pane_id),
            )

    cur = await conn.execute(
        "select count(*) from idea_ws.sections where user_id = %s and project_id = %s", (user_id, project_id)
    )
    sections = await cur.fetchone()
    return ImportResult(
        project_id=project_id,
        sections=int(sections["count"]) if sections else 0,
        notes=len(note_ids),
        prds=len(data.prds),
    )
