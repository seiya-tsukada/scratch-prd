"""server/prompts.test.ts からの移植"""

from __future__ import annotations

from backend.app.config import EXISTING_PRD_CONTEXT_MAX_CHARS
from backend.app.models.ai import GeneratePrdRequest, PrdNoteInput, StructureRoughNoteRequest
from backend.app.services.prompts import build_generate_prd_prompt, build_structure_rough_note_prompt


def base_request(**overrides: object) -> GeneratePrdRequest:
    values: dict[str, object] = {
        "project_name": "Proj",
        "mode": "strict",
        "detail_level": "brief",
        "notes": [PrdNoteInput(id="n1", title="", content="body")],
    }
    values.update(overrides)
    return GeneratePrdRequest.model_validate(values)


def test_generate_prd_prompt_contains_mode_detail_and_notes() -> None:
    prompt = build_generate_prd_prompt(base_request())
    assert "【Mode A: 厳密 (Strict)】" in prompt
    assert "Detail: 要点を絞ったコンパクトなPRD" in prompt
    assert "[Note #1] ID: n1 | Section: General | Title: (無題)\nContent:\nbody" in prompt


def test_generate_prd_prompt_defaults_to_suggest_and_standard() -> None:
    prompt = build_generate_prd_prompt(base_request(mode=None, detail_level=None))
    assert "【Mode B: 整理＆提案 (Suggest) - 推奨】" in prompt
    assert "Detail: 実践的で明確な標準PRD" in prompt


def test_generate_prd_prompt_truncates_existing_prd() -> None:
    existing_prd = "x" * (EXISTING_PRD_CONTEXT_MAX_CHARS + 50)
    prompt = build_generate_prd_prompt(base_request(existing_prd=existing_prd))
    assert f"Previous PRD Reference:\n{'x' * EXISTING_PRD_CONTEXT_MAX_CHARS}\n" in prompt
    assert "x" * (EXISTING_PRD_CONTEXT_MAX_CHARS + 1) not in prompt


def test_structure_prompt_uses_defaults() -> None:
    prompt = build_structure_rough_note_prompt(StructureRoughNoteRequest(content="memo"))
    assert "Project: Idea Workspace" in prompt
    assert "Raw scribble title: (無題)" in prompt
    assert '"""\nmemo\n"""' in prompt
