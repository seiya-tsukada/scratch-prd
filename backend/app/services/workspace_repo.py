"""ユーザー配下データ（projects / notes / tags / prds / preferences）の DB 操作。

すべての関数は user_id を必須で受け取り、すべてのクエリに user_id 条件を付ける。
他人の ID・存在しない ID は NotFoundError（ルーターで 404）にして、存在を漏らさない。
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import UUID

from psycopg import errors as pg_errors
from psycopg import sql
from psycopg.types.json import Jsonb

from backend.app import config
from backend.app.db import Conn
from backend.app.models.workspace import (
    Bootstrap,
    Note,
    NoteCreate,
    NoteTagsSave,
    NoteUpdate,
    PaneInfo,
    PrdDocument,
    PrdSave,
    PrdVersion,
    PreferencesSave,
    Project,
    ProjectData,
    ProjectUpdate,
    Tag,
    TagCreate,
    TagUpdate,
    WorkspacePreferences,
)


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    """メモが base_updated_at より後に更新されていた"""

    def __init__(self, current: Note) -> None:
        super().__init__("note was updated by someone else")
        self.current = current


class TagExistsError(Exception):
    """同じプロジェクトに同じ名前（大文字小文字を区別しない）のタグがある"""

    def __init__(self, existing: Tag) -> None:
        super().__init__("tag already exists")
        self.existing = existing


class LimitExceededError(Exception):
    def __init__(self, resource: str, limit: int) -> None:
        super().__init__(f"{resource} limit ({limit}) exceeded")
        self.resource = resource
        self.limit = limit


# ---------------------------------------------------------------- 共通


async def _fetch_one(conn: Conn, query: str | sql.Composed, params: tuple[Any, ...]) -> dict[str, Any] | None:
    cur = await conn.execute(query, params)
    return await cur.fetchone()


async def _fetch_all(conn: Conn, query: str | sql.Composed, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    cur = await conn.execute(query, params)
    return await cur.fetchall()


async def _count(conn: Conn, query: str, params: tuple[Any, ...]) -> int:
    row = await _fetch_one(conn, query, params)
    return int(row["count"]) if row else 0


async def _ensure_below_limit(conn: Conn, resource: str, limit: int, query: str, params: tuple[Any, ...]) -> None:
    if await _count(conn, query, params) >= limit:
        raise LimitExceededError(resource, limit)


def _set_clause(updates: dict[str, Any]) -> sql.Composed:
    return sql.SQL(", ").join(sql.SQL("{} = {}").format(sql.Identifier(k), sql.Placeholder()) for k in updates)


async def _update_owned(
    conn: Conn, table: str, user_id: UUID, row_id: UUID, updates: dict[str, Any]
) -> dict[str, Any] | None:
    """自分の行だけを部分更新する。更新項目が無ければ現在の行を返す"""
    if not updates:
        return await _fetch_one(
            conn,
            sql.SQL("select * from idea_ws.{} where id = %s and user_id = %s").format(sql.Identifier(table)),
            (row_id, user_id),
        )
    query = sql.SQL("update idea_ws.{} set {} where id = %s and user_id = %s returning *").format(
        sql.Identifier(table), _set_clause(updates)
    )
    return await _fetch_one(conn, query, (*updates.values(), row_id, user_id))


async def _delete_owned(conn: Conn, table: str, user_id: UUID, row_id: UUID) -> None:
    cur = await conn.execute(
        sql.SQL("delete from idea_ws.{} where id = %s and user_id = %s").format(sql.Identifier(table)),
        (row_id, user_id),
    )
    if cur.rowcount == 0:
        raise NotFoundError


# ---------------------------------------------------------------- projects


async def list_projects(conn: Conn, user_id: UUID) -> list[Project]:
    rows = await _fetch_all(
        conn, "select * from idea_ws.projects where user_id = %s order by created_at desc, id", (user_id,)
    )
    return [Project.model_validate(r) for r in rows]


async def get_project(conn: Conn, user_id: UUID, project_id: UUID) -> Project:
    row = await _fetch_one(conn, "select * from idea_ws.projects where id = %s and user_id = %s", (project_id, user_id))
    if row is None:
        raise NotFoundError
    return Project.model_validate(row)


async def create_project(conn: Conn, user_id: UUID, name: str, description: str) -> Project:
    await _ensure_below_limit(
        conn,
        "projects",
        config.MAX_PROJECTS_PER_USER,
        "select count(*) from idea_ws.projects where user_id = %s",
        (user_id,),
    )
    row = await _fetch_one(
        conn,
        "insert into idea_ws.projects (user_id, name, description) values (%s, %s, %s) returning *",
        (user_id, name, description),
    )
    assert row is not None
    return Project.model_validate(row)


async def update_project(conn: Conn, user_id: UUID, project_id: UUID, update: ProjectUpdate) -> Project:
    row = await _update_owned(conn, "projects", user_id, project_id, update.model_dump(exclude_none=True))
    if row is None:
        raise NotFoundError
    return Project.model_validate(row)


async def delete_project(conn: Conn, user_id: UUID, project_id: UUID) -> None:
    await _delete_owned(conn, "projects", user_id, project_id)


# ---------------------------------------------------------------- notes


# メモに付いているタグ ID（付けた順）。notes の別名を n として使う
_NOTE_TAG_IDS = """
  array(
    select nt.tag_id from idea_ws.note_tags nt
    where nt.note_id = n.id and nt.user_id = n.user_id
    order by nt.created_at, nt.tag_id
  ) as tag_ids
"""


async def list_notes(conn: Conn, user_id: UUID, project_id: UUID) -> list[Note]:
    rows = await _fetch_all(
        conn,
        f"select n.*, {_NOTE_TAG_IDS} from idea_ws.notes n "
        "where n.user_id = %s and n.project_id = %s order by n.updated_at desc, n.id",
        (user_id, project_id),
    )
    return [Note.model_validate(r) for r in rows]


async def get_note(conn: Conn, user_id: UUID, note_id: UUID) -> Note:
    row = await _fetch_one(
        conn, f"select n.*, {_NOTE_TAG_IDS} from idea_ws.notes n where n.id = %s and n.user_id = %s", (note_id, user_id)
    )
    if row is None:
        raise NotFoundError
    return Note.model_validate(row)


async def create_note(conn: Conn, user_id: UUID, project_id: UUID, body: NoteCreate) -> Note:
    await get_project(conn, user_id, project_id)
    await _ensure_below_limit(
        conn,
        "notes",
        config.MAX_NOTES_PER_PROJECT,
        "select count(*) from idea_ws.notes where user_id = %s and project_id = %s",
        (user_id, project_id),
    )
    row = await _fetch_one(
        conn,
        """
        insert into idea_ws.notes (user_id, project_id, title, content)
        values (%s, %s, %s, %s) returning *
        """,
        (user_id, project_id, body.title, body.content),
    )
    assert row is not None
    return Note.model_validate(row)


async def update_note(conn: Conn, user_id: UUID, note_id: UUID, body: NoteUpdate) -> Note:
    updates = body.model_dump(exclude_none=True, exclude={"base_updated_at"})
    if not updates:
        return await get_note(conn, user_id, note_id)

    query = sql.SQL(
        "update idea_ws.notes set {} where id = %s and user_id = %s "
        "and (%s::timestamptz is null or updated_at = %s::timestamptz) returning *"
    ).format(_set_clause(updates))
    base = body.base_updated_at
    row = await _fetch_one(conn, query, (*updates.values(), note_id, user_id, base, base))
    if row is None:
        # 存在しない（404）か、他で先に更新された（409）
        raise ConflictError(await get_note(conn, user_id, note_id))
    return await get_note(conn, user_id, note_id)


async def delete_note(conn: Conn, user_id: UUID, note_id: UUID) -> None:
    await _delete_owned(conn, "notes", user_id, note_id)


async def set_note_tags(conn: Conn, user_id: UUID, note_id: UUID, body: NoteTagsSave) -> Note:
    """メモのタグを tag_ids で置き換える。タグはメモと同じプロジェクトの自分のものに限る。
    メモの updated_at は変えない（本文の自動保存の競合判定に影響させないため）"""
    note = await get_note(conn, user_id, note_id)
    tag_ids = list(dict.fromkeys(body.tag_ids))
    if tag_ids:
        owned = await _fetch_all(
            conn,
            "select id from idea_ws.tags where user_id = %s and project_id = %s and id = any(%s)",
            (user_id, note.project_id, tag_ids),
        )
        if len(owned) != len(tag_ids):
            raise NotFoundError
    async with conn.transaction():
        await conn.execute(
            "delete from idea_ws.note_tags where user_id = %s and note_id = %s and not (tag_id = any(%s))",
            (user_id, note_id, tag_ids),
        )
        # 付けた順を保つため、1 件ずつ時刻をずらして入れる
        await conn.execute(
            """
            insert into idea_ws.note_tags (note_id, tag_id, user_id, project_id, created_at)
            select %s, t.id, %s, %s, now() + make_interval(secs => t.ord * 0.000001)
            from unnest(%s::uuid[]) with ordinality as t(id, ord)
            on conflict (note_id, tag_id) do nothing
            """,
            (note_id, user_id, note.project_id, tag_ids),
        )
    return await get_note(conn, user_id, note_id)


# ---------------------------------------------------------------- tags


async def list_tags(conn: Conn, user_id: UUID, project_id: UUID) -> list[Tag]:
    rows = await _fetch_all(
        conn,
        "select * from idea_ws.tags where user_id = %s and project_id = %s order by lower(name), id",
        (user_id, project_id),
    )
    return [Tag.model_validate(r) for r in rows]


async def _get_tag(conn: Conn, user_id: UUID, tag_id: UUID) -> Tag:
    row = await _fetch_one(conn, "select * from idea_ws.tags where id = %s and user_id = %s", (tag_id, user_id))
    if row is None:
        raise NotFoundError
    return Tag.model_validate(row)


async def _tag_by_name(conn: Conn, user_id: UUID, project_id: UUID, name: str) -> Tag:
    row = await _fetch_one(
        conn,
        "select * from idea_ws.tags where user_id = %s and project_id = %s and lower(name) = lower(%s)",
        (user_id, project_id, name),
    )
    if row is None:
        raise NotFoundError
    return Tag.model_validate(row)


async def create_tag(conn: Conn, user_id: UUID, project_id: UUID, body: TagCreate) -> Tag:
    """同じ名前（大文字小文字を区別しない）のタグがあれば TagExistsError（既存のタグを返す）"""
    await get_project(conn, user_id, project_id)
    await _ensure_below_limit(
        conn,
        "tags",
        config.MAX_TAGS_PER_PROJECT,
        "select count(*) from idea_ws.tags where user_id = %s and project_id = %s",
        (user_id, project_id),
    )
    try:
        async with conn.transaction():
            row = await _fetch_one(
                conn,
                "insert into idea_ws.tags (user_id, project_id, name, color) values (%s, %s, %s, %s) returning *",
                (user_id, project_id, body.name, body.color),
            )
    except pg_errors.UniqueViolation:
        raise TagExistsError(await _tag_by_name(conn, user_id, project_id, body.name)) from None
    assert row is not None
    return Tag.model_validate(row)


async def update_tag(conn: Conn, user_id: UUID, tag_id: UUID, body: TagUpdate) -> Tag:
    """送られた項目だけ更新する（color: null は色を外す）。名前が他のタグと重なれば TagExistsError"""
    updates = body.model_dump(include=body.model_fields_set)
    if updates.get("name") is None:
        updates.pop("name", None)
    tag = await _get_tag(conn, user_id, tag_id)
    try:
        async with conn.transaction():
            row = await _update_owned(conn, "tags", user_id, tag_id, updates)
    except pg_errors.UniqueViolation:
        raise TagExistsError(await _tag_by_name(conn, user_id, tag.project_id, updates["name"])) from None
    if row is None:
        raise NotFoundError
    return Tag.model_validate(row)


async def delete_tag(conn: Conn, user_id: UUID, tag_id: UUID) -> None:
    """メモとの紐付け（note_tags）は外部キーの cascade で消える"""
    await _delete_owned(conn, "tags", user_id, tag_id)


# ---------------------------------------------------------------- PRD


def _prd_body_params(body: PrdSave) -> tuple[Any, ...]:
    """jsonb には API と同じ camelCase のキーで保存する（src/types の PrdFact などと同じ形）"""
    dumped = body.model_dump(by_alias=True, exclude_none=True, mode="json")
    return (
        body.title,
        body.content,
        body.generation_mode,
        body.detail_level,
        body.source_note_ids,
        Jsonb(dumped["facts"]),
        Jsonb(dumped["proposals"]),
        Jsonb(dumped["openQuestions"]),
        Jsonb(dumped["contradictions"]),
    )


async def _versions_by_prd(conn: Conn, user_id: UUID, prd_ids: list[UUID]) -> dict[UUID, list[PrdVersion]]:
    rows = await _fetch_all(
        conn,
        """
        select * from idea_ws.prd_versions
        where user_id = %s and prd_document_id = any(%s)
        order by version_number desc
        """,
        (user_id, prd_ids),
    )
    grouped: dict[UUID, list[PrdVersion]] = defaultdict(list)
    for r in rows:
        grouped[UUID(str(r["prd_document_id"]))].append(PrdVersion.model_validate(r))
    return grouped


async def _with_versions(conn: Conn, user_id: UUID, rows: list[dict[str, Any]]) -> list[PrdDocument]:
    versions = await _versions_by_prd(conn, user_id, [r["id"] for r in rows])
    return [PrdDocument.model_validate({**r, "versions": versions.get(UUID(str(r["id"])), [])}) for r in rows]


async def list_prds(conn: Conn, user_id: UUID, project_id: UUID) -> list[PrdDocument]:
    rows = await _fetch_all(
        conn,
        "select * from idea_ws.prd_documents where user_id = %s and project_id = %s order by updated_at desc, id",
        (user_id, project_id),
    )
    return await _with_versions(conn, user_id, rows)


async def get_prd(conn: Conn, user_id: UUID, prd_id: UUID) -> PrdDocument:
    row = await _fetch_one(
        conn, "select * from idea_ws.prd_documents where id = %s and user_id = %s", (prd_id, user_id)
    )
    if row is None:
        raise NotFoundError
    [prd] = await _with_versions(conn, user_id, [row])
    return prd


async def create_prd(conn: Conn, user_id: UUID, project_id: UUID, body: PrdSave) -> PrdDocument:
    await get_project(conn, user_id, project_id)
    await _ensure_below_limit(
        conn,
        "prds",
        config.MAX_PRDS_PER_PROJECT,
        "select count(*) from idea_ws.prd_documents where user_id = %s and project_id = %s",
        (user_id, project_id),
    )
    row = await _fetch_one(
        conn,
        """
        insert into idea_ws.prd_documents
          (user_id, project_id, title, content, generation_mode, detail_level, source_note_ids,
           facts, proposals, open_questions, contradictions)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning *
        """,
        (user_id, project_id, *_prd_body_params(body)),
    )
    assert row is not None
    return PrdDocument.model_validate({**row, "versions": []})


async def save_prd_version(conn: Conn, user_id: UUID, prd_id: UUID, body: PrdSave) -> PrdDocument:
    """現在の内容を prd_versions に積んでから更新し、版番号を 1 上げる"""
    async with conn.transaction():
        current = await _fetch_one(
            conn, "select * from idea_ws.prd_documents where id = %s and user_id = %s for update", (prd_id, user_id)
        )
        if current is None:
            raise NotFoundError
        await conn.execute(
            """
            insert into idea_ws.prd_versions
              (user_id, prd_document_id, version_number, title, content, generation_mode, detail_level,
               source_note_ids, facts, proposals, open_questions, contradictions, summary, created_at)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                prd_id,
                current["version"],
                current["title"],
                current["content"],
                current["generation_mode"],
                current["detail_level"],
                current["source_note_ids"],
                Jsonb(current["facts"]),
                Jsonb(current["proposals"]),
                Jsonb(current["open_questions"]),
                Jsonb(current["contradictions"]),
                f"Version {current['version']} ({current['generation_mode']})",
                current["updated_at"],
            ),
        )
        await conn.execute(
            """
            update idea_ws.prd_documents
            set title = %s, content = %s, generation_mode = %s, detail_level = %s, source_note_ids = %s,
                facts = %s, proposals = %s, open_questions = %s, contradictions = %s, version = version + 1
            where id = %s and user_id = %s
            """,
            (*_prd_body_params(body), prd_id, user_id),
        )
        # 履歴が上限を超えたら古い版から削除する
        await conn.execute(
            """
            delete from idea_ws.prd_versions
            where user_id = %s and prd_document_id = %s and id not in (
              select id from idea_ws.prd_versions
              where user_id = %s and prd_document_id = %s
              order by version_number desc limit %s
            )
            """,
            (user_id, prd_id, user_id, prd_id, config.MAX_PRD_VERSIONS_PER_PRD),
        )
    return await get_prd(conn, user_id, prd_id)


async def delete_prd(conn: Conn, user_id: UUID, prd_id: UUID) -> None:
    await _delete_owned(conn, "prd_documents", user_id, prd_id)


# ---------------------------------------------------------------- preferences


def default_preferences(user_id: UUID, project_id: UUID) -> WorkspacePreferences:
    """未保存のときの既定値。ペインへのメモの割り当てはフロントが行う"""
    return WorkspacePreferences(
        user_id=user_id,
        project_id=project_id,
        pane_count=config.DEFAULT_PANE_COUNT,
        panes=[PaneInfo(id=pane_id) for pane_id in config.PANE_IDS],
        active_pane_id=config.PANE_IDS[0],
    )


async def get_preferences(conn: Conn, user_id: UUID, project_id: UUID) -> WorkspacePreferences:
    row = await _fetch_one(
        conn,
        "select * from idea_ws.workspace_preferences where user_id = %s and project_id = %s",
        (user_id, project_id),
    )
    return WorkspacePreferences.model_validate(row) if row else default_preferences(user_id, project_id)


async def save_preferences(conn: Conn, user_id: UUID, project_id: UUID, body: PreferencesSave) -> WorkspacePreferences:
    await get_project(conn, user_id, project_id)
    panes = Jsonb([p.model_dump(by_alias=True, mode="json") for p in body.panes])
    row = await _fetch_one(
        conn,
        """
        insert into idea_ws.workspace_preferences (user_id, project_id, pane_count, panes, active_pane_id)
        values (%s, %s, %s, %s, %s)
        on conflict (user_id, project_id) do update
          set pane_count = excluded.pane_count, panes = excluded.panes, active_pane_id = excluded.active_pane_id
        returning *
        """,
        (user_id, project_id, body.pane_count, panes, body.active_pane_id),
    )
    return WorkspacePreferences.model_validate(row)


# ---------------------------------------------------------------- まとめて取得


async def get_project_data(conn: Conn, user_id: UUID, project_id: UUID) -> ProjectData:
    await get_project(conn, user_id, project_id)
    return ProjectData(
        notes=await list_notes(conn, user_id, project_id),
        tags=await list_tags(conn, user_id, project_id),
        prds=await list_prds(conn, user_id, project_id),
        preferences=await get_preferences(conn, user_id, project_id),
    )


async def bootstrap(conn: Conn, user_id: UUID, project_id: UUID | None) -> Bootstrap:
    """プロジェクト一覧と、指定（無ければ先頭）のプロジェクトのデータ。指定が自分のものでなければ先頭にする"""
    projects = await list_projects(conn, user_id)
    current = next((p for p in projects if p.id == project_id), projects[0] if projects else None)
    return Bootstrap(
        projects=projects,
        current_project_id=current.id if current else None,
        data=await get_project_data(conn, user_id, current.id) if current else None,
    )
