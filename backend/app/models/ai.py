"""AI エンドポイントの入出力。JSON のキーは camelCase で src/config/api.ts / src/types/index.ts と一致させる"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from backend.app import config

PrdGenerationMode = Literal["strict", "suggest", "expand"]
PrdDetailLevel = Literal["brief", "standard", "detailed"]
FallbackReason = Literal["no_api_key", "ai_error", "invalid_response"]

DEFAULT_GENERATION_MODE: PrdGenerationMode = "suggest"
DEFAULT_DETAIL_LEVEL: PrdDetailLevel = "standard"


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---------------------------------------------------------------- PRD の構成要素


class PrdFact(CamelModel):
    id: str
    text: str
    source_note_id: str | None = None
    source_note_title: str | None = None


class PrdProposal(CamelModel):
    id: str
    category: str
    title: str
    description: str
    impact: Literal["high", "medium", "low"] | None = None


class PrdOpenQuestion(CamelModel):
    id: str
    question: str
    context: str
    urgency: Literal["critical", "normal"]


class PrdContradiction(CamelModel):
    """メモ同士の食い違い。notes_involved は関係するメモの ID"""

    id: str
    issue: str
    notes_involved: list[str]


# ---------------------------------------------------------------- 殴り書きの整形


class StructureRoughNoteRequest(CamelModel):
    title: str | None = Field(default=None, max_length=config.MAX_TITLE_CHARS)
    content: str = Field(max_length=config.MAX_ROUGH_NOTE_CHARS)
    project_name: str | None = Field(default=None, max_length=config.MAX_TITLE_CHARS)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Note content is required")
        return value


class StructuredNote(CamelModel):
    """整形結果の本体。Gemini の responseSchema にも使う"""

    structured_title: str
    structured_content: str


class StructureRoughNoteResponse(StructuredNote):
    used_fallback: bool
    fallback_reason: FallbackReason | None = None


# ---------------------------------------------------------------- PRD 生成


class PrdNoteInput(CamelModel):
    id: str
    title: str = Field(default="", max_length=config.MAX_TITLE_CHARS)
    content: str = Field(max_length=config.MAX_NOTE_CONTENT_CHARS)
    section_name: str | None = Field(default=None, max_length=config.MAX_TITLE_CHARS)


PreviousItem = Field(max_length=config.MAX_PREVIOUS_ITEM_CHARS)


class PreviousOpenQuestion(CamelModel):
    question: str = PreviousItem
    context: str = Field(default="", max_length=config.MAX_PREVIOUS_ITEM_CHARS)


class PreviousDecision(CamelModel):
    """未決事項への回答（確定した事実として扱う）"""

    question: str = PreviousItem
    answer: str = PreviousItem


class PreviousPrd(CamelModel):
    """再生成時に渡す前回の PRD の要約。本文を切り詰めて渡す代わりに、構成と要点を渡す"""

    title: str = Field(default="", max_length=config.MAX_TITLE_CHARS)
    headings: list[str] = Field(default=[], max_length=config.MAX_PREVIOUS_ITEMS)
    facts: list[str] = Field(default=[], max_length=config.MAX_PREVIOUS_ITEMS)
    open_questions: list[PreviousOpenQuestion] = Field(default=[], max_length=config.MAX_PREVIOUS_ITEMS)
    decisions: list[PreviousDecision] = Field(default=[], max_length=config.MAX_PREVIOUS_ITEMS)

    @field_validator("headings", "facts")
    @classmethod
    def items_within_limit(cls, values: list[str]) -> list[str]:
        if any(len(v) > config.MAX_PREVIOUS_ITEM_CHARS for v in values):
            raise ValueError(f"Each item must be at most {config.MAX_PREVIOUS_ITEM_CHARS} characters")
        return values


class GeneratePrdRequest(CamelModel):
    project_name: str = Field(default="", max_length=config.MAX_TITLE_CHARS)
    mode: PrdGenerationMode | None = DEFAULT_GENERATION_MODE
    detail_level: PrdDetailLevel | None = DEFAULT_DETAIL_LEVEL
    notes: list[PrdNoteInput] = Field(min_length=1, max_length=config.MAX_NOTES)
    previous_prd: PreviousPrd | None = None

    @model_validator(mode="after")
    def total_chars_within_limit(self) -> GeneratePrdRequest:
        total = sum(len(n.content) for n in self.notes)
        if total > config.MAX_TOTAL_NOTE_CHARS:
            raise ValueError(f"Total note content exceeds {config.MAX_TOTAL_NOTE_CHARS} characters")
        return self


class GeneratedPrd(CamelModel):
    """生成された PRD の本体。Gemini の responseSchema にも使う"""

    markdown: str
    facts: list[PrdFact] = []
    proposals: list[PrdProposal] = []
    open_questions: list[PrdOpenQuestion] = []
    contradictions: list[PrdContradiction] = []


class GeneratePrdResponse(GeneratedPrd):
    source_note_ids: list[str]
    used_fallback: bool
    fallback_reason: FallbackReason | None = None
