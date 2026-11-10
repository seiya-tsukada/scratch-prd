"""旧 localStorage データ（1 プロジェクト分）を取り込む。

旧 ID はすべて新しい uuid に振り直し、次の参照も書き換える:
  PRD の sourceNoteIds・facts[].sourceNoteId・contradictions[].notesInvolved・versions[] / ペインの noteId。
セクションは取り込まない。名前が「PRD」で始まるセクションのメモは PRD に変換し（生成元メモは空、
生成モードは unknown）、それ以外のメモはそのままメモとして取り込む。
作成・更新日時は旧データの値を引き継ぐ（無ければ現在時刻）。
"""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from backend.app import config
from backend.app.db import Conn
from backend.app.models.workspace import ImportResult, LegacyPrdBody, LegacyProjectImport
from backend.app.services.workspace_repo import LimitExceededError

PRD_SECTION = re.compile(config.LEGACY_PRD_SECTION_PATTERN, re.IGNORECASE)
UNTITLED_PRD_TITLE = "無題のPRD"
_HEADING_PREFIX = re.compile(r"^#+\s*")


def _prd_title(title: str, content: str) -> str:
    """タイトルが空なら本文の 1 行目（見出し記号を除く）。マイグレーションと同じ規則"""
    first_line = _HEADING_PREFIX.sub("", content.split("\n")[0], count=1).strip()
    return (title.strip() or first_line or UNTITLED_PRD_TITLE)[: config.MAX_NAME_CHARS]


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
    cur = await conn.execute("select count(*) from scratch_prd.projects where user_id = %s", (user_id,))
    row = await cur.fetchone()
    if row and row["count"] >= config.MAX_PROJECTS_PER_USER:
        raise LimitExceededError("projects", config.MAX_PROJECTS_PER_USER)

    async with conn.transaction():
        p = data.project
        project_id = await _insert_id(
            conn,
            """
            insert into scratch_prd.projects (user_id, name, description, created_at, updated_at)
            values (%s, %s, %s, coalesce(%s, now()), coalesce(%s, now())) returning id
            """,
            (user_id, p.name, p.description, p.created_at, p.updated_at),
        )

        prd_section_ids = {sec.id for sec in data.sections if PRD_SECTION.match(sec.name)}
        converted_prds = 0

        note_ids: dict[str, UUID] = {}
        for n in data.notes:
            if n.section_id in prd_section_ids:
                await conn.execute(
                    """
                    insert into scratch_prd.prd_documents
                      (user_id, project_id, title, content, generation_mode, source_note_ids, created_at, updated_at)
                    values (%s, %s, %s, %s, 'unknown', '{}', coalesce(%s, now()), coalesce(%s, now()))
                    """,
                    (user_id, project_id, _prd_title(n.title, n.content), n.content, n.created_at, n.updated_at),
                )
                converted_prds += 1
                continue
            note_ids[n.id] = await _insert_id(
                conn,
                """
                insert into scratch_prd.notes
                  (user_id, project_id, title, content, position, created_at, updated_at)
                values (%s, %s, %s, %s, %s, coalesce(%s, now()), coalesce(%s, now())) returning id
                """,
                (user_id, project_id, n.title, n.content, n.position, n.created_at, n.updated_at),
            )

        for prd in data.prds:
            body = _remap_prd_body(prd, note_ids)
            prd_id = await _insert_id(
                conn,
                """
                insert into scratch_prd.prd_documents
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
                    insert into scratch_prd.prd_versions
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
                insert into scratch_prd.workspace_preferences (user_id, project_id, pane_count, panes, active_pane_id)
                values (%s, %s, %s, %s, %s)
                """,
                (user_id, project_id, prefs.pane_count, Jsonb(panes), prefs.active_pane_id),
            )

    return ImportResult(
        project_id=project_id,
        notes=len(note_ids),
        prds=len(data.prds) + converted_prds,
    )
