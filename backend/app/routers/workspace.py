"""Workspace API: projects / sections / notes / prds / preferences と旧 localStorage データの取り込み。
ログイン（ゲスト可）必須。他人のリソースは 404（main.py の例外ハンドラ）"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app import config, security
from backend.app.db import Db
from backend.app.models.workspace import (
    Bootstrap,
    ImportResult,
    LegacyProjectImport,
    Note,
    NoteCreate,
    NoteUpdate,
    PrdDocument,
    PrdSave,
    PreferencesSave,
    Project,
    ProjectCreate,
    ProjectData,
    ProjectUpdate,
    Section,
    SectionCreate,
    SectionOrder,
    SectionUpdate,
    WorkspacePreferences,
)
from backend.app.services import legacy_import
from backend.app.services import workspace_repo as repo
from backend.app.sessions import CurrentUser

router = APIRouter(dependencies=[Depends(security.verify_origin)])

# ---------------------------------------------------------------- まとめて取得


@router.get("/workspace/bootstrap", response_model_exclude_none=True)
async def bootstrap(user: CurrentUser, db: Db, project_id: UUID | None = None) -> Bootstrap:
    """初回表示用: プロジェクト一覧と、指定（無ければ先頭）のプロジェクトのデータ"""
    return await repo.bootstrap(db, user.user_id, project_id)


@router.get("/projects/{project_id}/data", response_model_exclude_none=True)
async def project_data(project_id: UUID, user: CurrentUser, db: Db) -> ProjectData:
    return await repo.get_project_data(db, user.user_id, project_id)


# ---------------------------------------------------------------- projects


@router.get("/projects")
async def list_projects(user: CurrentUser, db: Db) -> list[Project]:
    return await repo.list_projects(db, user.user_id)


@router.post("/projects", status_code=201)
async def create_project(body: ProjectCreate, user: CurrentUser, db: Db) -> Project:
    return await repo.create_project(db, user.user_id, body.name, body.description)


@router.patch("/projects/{project_id}")
async def update_project(project_id: UUID, body: ProjectUpdate, user: CurrentUser, db: Db) -> Project:
    return await repo.update_project(db, user.user_id, project_id, body)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: UUID, user: CurrentUser, db: Db) -> None:
    await repo.delete_project(db, user.user_id, project_id)


# ---------------------------------------------------------------- sections


@router.post("/projects/{project_id}/sections", status_code=201)
async def create_section(project_id: UUID, body: SectionCreate, user: CurrentUser, db: Db) -> Section:
    return await repo.create_section(db, user.user_id, project_id, body.name)


@router.put("/projects/{project_id}/sections/order")
async def reorder_sections(project_id: UUID, body: SectionOrder, user: CurrentUser, db: Db) -> list[Section]:
    return await repo.reorder_sections(db, user.user_id, project_id, body.ordered_ids)


@router.patch("/sections/{section_id}")
async def update_section(section_id: UUID, body: SectionUpdate, user: CurrentUser, db: Db) -> Section:
    return await repo.update_section(db, user.user_id, section_id, body)


@router.delete("/sections/{section_id}", status_code=204)
async def delete_section(section_id: UUID, user: CurrentUser, db: Db) -> None:
    await repo.delete_section(db, user.user_id, section_id)


# ---------------------------------------------------------------- notes


@router.post("/projects/{project_id}/notes", status_code=201)
async def create_note(project_id: UUID, body: NoteCreate, user: CurrentUser, db: Db) -> Note:
    return await repo.create_note(db, user.user_id, project_id, body)


@router.patch("/notes/{note_id}")
async def update_note(note_id: UUID, body: NoteUpdate, user: CurrentUser, db: Db) -> Note:
    """自動保存用の部分更新。baseUpdatedAt が最新でなければ 409 と最新のメモを返す"""
    return await repo.update_note(db, user.user_id, note_id, body)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: UUID, user: CurrentUser, db: Db) -> None:
    await repo.delete_note(db, user.user_id, note_id)


# ---------------------------------------------------------------- PRD


@router.post("/projects/{project_id}/prds", status_code=201, response_model_exclude_none=True)
async def create_prd(project_id: UUID, body: PrdSave, user: CurrentUser, db: Db) -> PrdDocument:
    return await repo.create_prd(db, user.user_id, project_id, body)


@router.put("/prds/{prd_id}", response_model_exclude_none=True)
async def save_prd(prd_id: UUID, body: PrdSave, user: CurrentUser, db: Db) -> PrdDocument:
    """現在の内容を版履歴に積んでから更新する（再生成・編集・版の復元）"""
    return await repo.save_prd_version(db, user.user_id, prd_id, body)


@router.delete("/prds/{prd_id}", status_code=204)
async def delete_prd(prd_id: UUID, user: CurrentUser, db: Db) -> None:
    await repo.delete_prd(db, user.user_id, prd_id)


# ---------------------------------------------------------------- preferences


@router.put("/projects/{project_id}/preferences", response_model_exclude_none=True)
async def save_preferences(project_id: UUID, body: PreferencesSave, user: CurrentUser, db: Db) -> WorkspacePreferences:
    return await repo.save_preferences(db, user.user_id, project_id, body)


# ---------------------------------------------------------------- 旧データの取り込み


@router.post(config.IMPORT_PATH.removeprefix("/api"), status_code=201)
async def import_local_project(body: LegacyProjectImport, user: CurrentUser, db: Db) -> ImportResult:
    """旧 localStorage のデータを 1 プロジェクト分取り込む（ID は振り直す）"""
    return await legacy_import.import_legacy_project(db, user.user_id, body)
