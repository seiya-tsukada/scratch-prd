"""server/prompts.test.ts からの移植"""

from __future__ import annotations

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


def test_generate_prd_prompt_explains_contradictions_with_note_ids() -> None:
    prompt = build_generate_prd_prompt(base_request())
    assert "Contradictions:" in prompt
    assert '"notesInvolved": the exact note IDs' in prompt
    assert '"notesInvolved": ["note-id", "note-id"]' in prompt  # 出力例
    assert "If there is no disagreement, return an empty array" in prompt


def test_generate_prd_prompt_without_previous_prd_has_no_regeneration_block() -> None:
    assert "This is a regeneration" not in build_generate_prd_prompt(base_request())


def test_generate_prd_prompt_summarizes_previous_prd_without_truncation() -> None:
    long_fact = "長い事実" * 200  # 旧実装の 1000 文字切り詰めを超える
    prompt = build_generate_prd_prompt(
        base_request(
            previous_prd={
                "title": "前回のPRD",
                "headings": ["1. 概要", "2. 機能要件"],
                "facts": [long_fact],
                "openQuestions": [{"question": "対象 OS は？", "context": "iOS のみか"}, {"question": "料金は？"}],
                "decisions": [{"question": "対象 OS は？", "answer": "まずは iOS のみ"}],
            }
        )
    )
    assert "This is a regeneration of an existing PRD titled「前回のPRD」" in prompt
    assert "- 1. 概要\n- 2. 機能要件" in prompt
    assert f"- {long_fact}" in prompt
    assert "- 対象 OS は？（iOS のみか）\n- 料金は？" in prompt
    assert "- Q: 対象 OS は？ → A: まずは iOS のみ" in prompt
    assert "Treat every decision as a confirmed fact" in prompt
    assert "Remove open questions that a decision answers" in prompt


def test_previous_prd_empty_lists_are_marked() -> None:
    prompt = build_generate_prd_prompt(base_request(previous_prd={"title": ""}))
    assert "This is a regeneration of an existing PRD. Previous PRD summary:" in prompt
    assert prompt.count("- (なし)") == 4


def test_structure_prompt_uses_defaults() -> None:
    prompt = build_structure_rough_note_prompt(StructureRoughNoteRequest(content="memo"))
    assert "Project: Idea Workspace" in prompt
    assert "Raw scribble title: (無題)" in prompt
    assert '"""\nmemo\n"""' in prompt
