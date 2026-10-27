"""Workspace API の入出力。キーは camelCase で src/types/index.ts と対応させる"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from backend.app import config
from backend.app.models.ai import (
    CamelModel,
    PrdContradiction,
    PrdDetailLevel,
    PrdFact,
    PrdGenerationMode,
    PrdOpenQuestion,
    PrdProposal,
)

Name = Field(min_length=1, max_length=config.MAX_NAME_CHARS)


def _strip_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("name must not be blank")
    return value


# ---------------------------------------------------------------- 応答


class Project(CamelModel):
    id: UUID
    user_id: UUID
    name: str
    description: str
    created_at: datetime
    updated_at: datetime


class Section(CamelModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    name: str
    position: int
    icon: str | None = None
    created_at: datetime
    updated_at: datetime


class Note(CamelModel):
    id: UUID
    section_id: UUID
    project_id: UUID
    user_id: UUID
    title: str
    content: str
    position: int
    created_at: datetime
    updated_at: datetime


class PrdBody(CamelModel):
    """PRD 本体と各版のスナップショットに共通する項目"""

    title: str = Field(max_length=config.MAX_NAME_CHARS)
    content: str = Field(default="", max_length=config.MAX_STORED_PRD_CHARS)
    generation_mode: PrdGenerationMode
    detail_level: PrdDetailLevel = "standard"
    facts: list[PrdFact] = Field(default=[], max_length=config.MAX_PRD_ITEMS)
    proposals: list[PrdProposal] = Field(default=[], max_length=config.MAX_PRD_ITEMS)
    open_questions: list[PrdOpenQuestion] = Field(default=[], max_length=config.MAX_PRD_ITEMS)
    contradictions: list[PrdContradiction] = Field(default=[], max_length=config.MAX_PRD_ITEMS)


class PrdVersion(PrdBody):
    id: UUID
    prd_document_id: UUID
    version_number: int
    source_note_ids: list[UUID]
    summary: str | None = None
    created_at: datetime


class PrdDocument(PrdBody):
    id: UUID
    project_id: UUID
    user_id: UUID
    source_note_ids: list[UUID]
    version: int
    versions: list[PrdVersion] = []
    created_at: datetime
    updated_at: datetime


class PaneInfo(CamelModel):
    id: str = Field(max_length=20)
    note_id: UUID | None = None


class WorkspacePreferences(CamelModel):
    """未保存のプロジェクトでは id / updated_at が無い既定値を返す"""

    id: UUID | None = None
    user_id: UUID
    project_id: UUID
    pane_count: int = Field(ge=1, le=config.MAX_PANES)
    panes: list[PaneInfo]
    active_pane_id: str
    updated_at: datetime | None = None


class ProjectData(CamelModel):
    sections: list[Section]
    notes: list[Note]
    prds: list[PrdDocument]
    preferences: WorkspacePreferences


class Bootstrap(CamelModel):
    projects: list[Project]
    current_project_id: UUID | None
    data: ProjectData | None


# ---------------------------------------------------------------- 要求


class ProjectCreate(CamelModel):
    name: str = Name
    description: str = Field(default="", max_length=config.MAX_DESCRIPTION_CHARS)

    _name = field_validator("name")(_strip_name)


class ProjectUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=config.MAX_NAME_CHARS)
    description: str | None = Field(default=None, max_length=config.MAX_DESCRIPTION_CHARS)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return None if value is None else _strip_name(value)


class SectionCreate(CamelModel):
    name: str = Name

    _name = field_validator("name")(_strip_name)


class SectionUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=config.MAX_NAME_CHARS)
    icon: str | None = Field(default=None, max_length=50)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return None if value is None else _strip_name(value)


class SectionOrder(CamelModel):
    ordered_ids: list[UUID] = Field(max_length=config.MAX_SECTIONS_PER_PROJECT)


class NoteCreate(CamelModel):
    section_id: UUID
    title: str = Field(default="", max_length=config.MAX_NAME_CHARS)
    content: str = Field(default="", max_length=config.MAX_STORED_NOTE_CHARS)


class NoteUpdate(CamelModel):
    """自動保存用の部分更新。base_updated_at を送ると、それ以降に他で更新されていれば 409"""

    title: str | None = Field(default=None, max_length=config.MAX_NAME_CHARS)
    content: str | None = Field(default=None, max_length=config.MAX_STORED_NOTE_CHARS)
    section_id: UUID | None = None
    base_updated_at: datetime | None = None


class PrdSave(PrdBody):
    """新規作成（POST）と、旧版を履歴に積んでの更新（PUT）に使う"""

    source_note_ids: list[UUID] = Field(default=[], max_length=config.MAX_PRD_SOURCE_NOTES)


class PreferencesSave(CamelModel):
    pane_count: int = Field(ge=1, le=config.MAX_PANES)
    panes: list[PaneInfo] = Field(max_length=config.MAX_PANES)
    active_pane_id: str = Field(max_length=20)


# ---------------------------------------------------------------- 旧 localStorage データの取り込み
#   旧データ（idea_workspace_*_v2）の ID は "note-<時刻>" などの文字列。取り込み時に uuid へ振り直す。
#   旧版で無かった項目は既定値で補い、未知の項目は無視する


class LegacyModel(CamelModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


LegacyId = Field(min_length=1, max_length=200)


class LegacyProject(LegacyModel):
    id: str = LegacyId
    name: str = Field(min_length=1, max_length=config.MAX_NAME_CHARS)
    description: str = Field(default="", max_length=config.MAX_DESCRIPTION_CHARS)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LegacySection(LegacyModel):
    id: str = LegacyId
    name: str = Field(min_length=1, max_length=config.MAX_NAME_CHARS)
    position: int = 0
    icon: str | None = Field(default=None, max_length=50)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LegacyNote(LegacyModel):
    id: str = LegacyId
    section_id: str = Field(default="", max_length=200)
    title: str = Field(default="", max_length=config.MAX_NAME_CHARS)
    content: str = Field(default="", max_length=config.MAX_STORED_NOTE_CHARS)
    position: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LegacyPrdBody(PrdBody):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    source_note_ids: list[str] = Field(default=[], max_length=config.MAX_PRD_SOURCE_NOTES)


class LegacyPrdVersion(LegacyPrdBody):
    version_number: int = Field(ge=1)
    summary: str | None = Field(default=None, max_length=config.MAX_NAME_CHARS)
    created_at: datetime | None = None


class LegacyPrd(LegacyPrdBody):
    id: str = LegacyId
    version: int = Field(default=1, ge=1)
    versions: list[LegacyPrdVersion] = Field(default=[], max_length=config.MAX_PRD_VERSIONS_PER_PRD)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LegacyPane(LegacyModel):
    id: str = Field(max_length=20)
    note_id: str | None = Field(default=None, max_length=200)


class LegacyPreferences(LegacyModel):
    pane_count: int = Field(ge=1, le=config.MAX_PANES)
    panes: list[LegacyPane] = Field(max_length=config.MAX_PANES)
    active_pane_id: str = Field(max_length=20)


class LegacyProjectImport(LegacyModel):
    """旧データ 1 プロジェクト分（Vercel のリクエスト上限に収めるため、プロジェクトごとに送る）"""

    project: LegacyProject
    sections: list[LegacySection] = Field(default=[], max_length=config.MAX_SECTIONS_PER_PROJECT)
    notes: list[LegacyNote] = Field(default=[], max_length=config.MAX_NOTES_PER_PROJECT)
    prds: list[LegacyPrd] = Field(default=[], max_length=config.MAX_PRDS_PER_PROJECT)
    preferences: LegacyPreferences | None = None


class ImportResult(CamelModel):
    project_id: UUID
    sections: int
    notes: int
    prds: int
