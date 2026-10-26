"""server/fallbacks.test.ts からの移植"""

from __future__ import annotations

from datetime import datetime

import pytest

from backend.app.config import DISPLAY_TIMEZONE
from backend.app.models.ai import GeneratePrdRequest
from backend.app.services.fallbacks import (
    build_rough_note_error_fallback,
    generate_mock_prd,
    structure_rough_note_locally,
)


def request(**overrides: object) -> GeneratePrdRequest:
    values: dict[str, object] = {
        "projectName": "Proj",
        "mode": "suggest",
        "detailLevel": "standard",
        "notes": [
            {"id": "n1", "title": "", "content": "## 見出し\n2行目"},
            {"id": "n2", "title": "タイトル", "content": "a\nb"},
        ],
    }
    values.update(overrides)
    return GeneratePrdRequest.model_validate(values)


@pytest.mark.parametrize(("mode", "count"), [("strict", 0), ("suggest", 2), ("expand", 4)])
def test_proposal_count_per_mode(mode: str, count: int) -> None:
    assert len(generate_mock_prd(request(mode=mode)).proposals) == count


def test_strict_mode_has_no_proposal_section() -> None:
    assert "[PROPOSAL]" not in generate_mock_prd(request(mode="strict")).markdown
    assert "[PROPOSAL]" in generate_mock_prd(request(mode="suggest")).markdown


def test_facts_per_note() -> None:
    result = generate_mock_prd(request())
    assert [f.text for f in result.facts] == ["## 見出し\n2行目", "タイトル: a b"]
    assert [f.source_note_id for f in result.facts] == ["n1", "n2"]
    assert result.facts[0].source_note_title == "無題のメモ"


def test_detail_label_and_project_name_fallback() -> None:
    md = generate_mock_prd(request(detailLevel="brief", projectName="")).markdown
    assert "詳細度: **簡易**" in md
    assert md.startswith("# Idea Workspace — ")


def test_first_line_without_heading_marks_in_background() -> None:
    assert "- **無題のメモ**: 見出し" in generate_mock_prd(request()).markdown


def test_created_at_matches_js_locale_format() -> None:
    now = datetime(2026, 1, 5, 9, 3, 7, tzinfo=DISPLAY_TIMEZONE)
    assert "作成日時: **2026/1/5 9:03:07**" in generate_mock_prd(request(), now=now).markdown


def test_structure_locally_uses_first_line_and_strips_bullets() -> None:
    result = structure_rough_note_locally("", "# ログイン\n- メール認証\n• SSO")
    assert result.structured_title == "ログイン"
    assert "- [ ] メール認証\n- [ ] SSO" in result.structured_content


def test_structure_locally_trims_title() -> None:
    assert structure_rough_note_locally("  T ", "x").structured_title == "T"


def test_error_fallback_wraps_content_with_default_title() -> None:
    result = build_rough_note_error_fallback(None, "body")
    assert result.structured_title == "構造化メモ"
    assert "## 1. 概要\nbody" in result.structured_content


def test_header_lines_keep_markdown_hard_breaks() -> None:
    md = generate_mock_prd(request()).markdown
    assert "**  \n> 詳細度: **標準**  \n> 参照ノート数" in md
