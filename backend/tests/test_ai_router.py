"""AI エンドポイント: Gemini はモックし、正常 / 応答不正 / 例外 / キー未設定と入力上限を検証する"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from backend.app import config
from backend.app.main import app
from backend.app.models.ai import GeneratedPrd, StructuredNote
from backend.app.services.gemini import get_gemini_client, parse_structured


class FakeGemini:
    model = "fake-model"

    def __init__(self, result: BaseModel | None = None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.prompts: list[str] = []

    async def generate[T: BaseModel](self, prompt: str, schema: type[T]) -> T | None:
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        assert self.result is None or isinstance(self.result, schema)
        return self.result


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def use_gemini(gemini: FakeGemini | None) -> None:
    app.dependency_overrides[get_gemini_client] = lambda: gemini


PRD_REQUEST: dict[str, Any] = {
    "projectName": "Proj",
    "mode": "suggest",
    "detailLevel": "standard",
    "notes": [{"id": "n1", "title": "T", "content": "body", "sectionName": "Inbox"}],
}

AI_PRD = GeneratedPrd.model_validate(
    {
        "markdown": "# AI PRD",
        "facts": [{"id": "f1", "text": "fact", "sourceNoteId": "n1"}],
        "proposals": [{"id": "p1", "category": "c", "title": "t", "description": "d", "impact": "high"}],
        "openQuestions": [{"id": "q1", "question": "q", "context": "c", "urgency": "normal"}],
        "contradictions": [{"id": "c1", "issue": "i", "notesInvolved": ["n1"]}],
    }
)


# ---------------------------------------------------------------- generate-prd


def test_generate_prd_success(client: TestClient) -> None:
    gemini = FakeGemini(AI_PRD)
    use_gemini(gemini)

    body = client.post("/api/generate-prd", json=PRD_REQUEST).json()

    assert body["markdown"] == "# AI PRD"
    assert body["usedFallback"] is False
    assert "fallbackReason" not in body
    assert body["sourceNoteIds"] == ["n1"]
    assert body["facts"] == [{"id": "f1", "text": "fact", "sourceNoteId": "n1"}]
    assert body["openQuestions"][0]["urgency"] == "normal"
    assert body["contradictions"][0]["notesInvolved"] == ["n1"]
    assert "Section: Inbox" in gemini.prompts[0]


@pytest.mark.parametrize(
    ("gemini", "reason"),
    [
        (None, "no_api_key"),
        (FakeGemini(error=TimeoutError()), "ai_error"),
        (FakeGemini(error=RuntimeError("boom")), "ai_error"),
        (FakeGemini(None), "invalid_response"),
    ],
)
def test_generate_prd_fallbacks(client: TestClient, gemini: FakeGemini | None, reason: str) -> None:
    use_gemini(gemini)

    response = client.post("/api/generate-prd", json=PRD_REQUEST)

    assert response.status_code == 200
    body = response.json()
    assert body["usedFallback"] is True
    assert body["fallbackReason"] == reason
    assert body["markdown"].startswith("# Proj — Product Requirements Document")
    assert body["sourceNoteIds"] == ["n1"]


def test_generate_prd_empty_markdown_uses_placeholder(client: TestClient) -> None:
    use_gemini(FakeGemini(GeneratedPrd(markdown="")))
    body = client.post("/api/generate-prd", json=PRD_REQUEST).json()
    assert body["markdown"] == "# 生成されたPRD\n\n内容を生成しました。"
    assert body["usedFallback"] is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"notes": []},
        {"notes": [{"id": f"n{i}", "content": "x"} for i in range(config.MAX_NOTES + 1)]},
        {"notes": [{"id": "n1", "content": "x" * (config.MAX_NOTE_CONTENT_CHARS + 1)}]},
        {
            "notes": [
                {"id": f"n{i}", "content": "x" * config.MAX_NOTE_CONTENT_CHARS}
                for i in range(config.MAX_TOTAL_NOTE_CHARS // config.MAX_NOTE_CONTENT_CHARS + 1)
            ]
        },
        {"notes": [{"id": "n1", "title": "t" * (config.MAX_TITLE_CHARS + 1), "content": "x"}]},
        {"existingPrd": "x" * (config.MAX_EXISTING_PRD_CHARS + 1)},
        {"mode": "unknown"},
    ],
)
def test_generate_prd_rejects_invalid_input(client: TestClient, overrides: dict[str, Any]) -> None:
    use_gemini(FakeGemini(AI_PRD))
    response = client.post("/api/generate-prd", json={**PRD_REQUEST, **overrides})
    assert response.status_code == 422


def test_generate_prd_accepts_input_at_limits(client: TestClient) -> None:
    use_gemini(FakeGemini(AI_PRD))
    notes = [
        {"id": f"n{i}", "content": "x" * config.MAX_NOTE_CONTENT_CHARS}
        for i in range(config.MAX_TOTAL_NOTE_CHARS // config.MAX_NOTE_CONTENT_CHARS)
    ]
    response = client.post("/api/generate-prd", json={**PRD_REQUEST, "notes": notes})
    assert response.status_code == 200


# ---------------------------------------------------------------- structure-rough-note


def test_structure_success(client: TestClient) -> None:
    use_gemini(FakeGemini(StructuredNote(structured_title="AI title", structured_content="# AI")))

    body = client.post("/api/structure-rough-note", json={"title": "t", "content": "memo"}).json()

    assert body == {"structuredTitle": "AI title", "structuredContent": "# AI", "usedFallback": False}


def test_structure_success_without_title_uses_request_title(client: TestClient) -> None:
    use_gemini(FakeGemini(StructuredNote(structured_title="", structured_content="# AI")))
    body = client.post("/api/structure-rough-note", json={"title": "mine", "content": "memo"}).json()
    assert body["structuredTitle"] == "mine"


def test_structure_without_api_key_uses_local_structuring(client: TestClient) -> None:
    use_gemini(None)
    body = client.post("/api/structure-rough-note", json={"content": "# ログイン\n- メール認証"}).json()
    assert body["structuredTitle"] == "ログイン"
    assert body["usedFallback"] is True
    assert body["fallbackReason"] == "no_api_key"


@pytest.mark.parametrize(
    ("gemini", "reason"),
    [
        (FakeGemini(error=RuntimeError("boom")), "ai_error"),
        (FakeGemini(None), "invalid_response"),
        (FakeGemini(StructuredNote(structured_title="t", structured_content="")), "invalid_response"),
    ],
)
def test_structure_ai_failure_uses_error_fallback(client: TestClient, gemini: FakeGemini, reason: str) -> None:
    use_gemini(gemini)
    body = client.post("/api/structure-rough-note", json={"content": "body"}).json()
    assert body["structuredTitle"] == "構造化メモ"
    assert "## 1. 概要\nbody" in body["structuredContent"]
    assert body["usedFallback"] is True
    assert body["fallbackReason"] == reason


@pytest.mark.parametrize(
    "payload",
    [
        {"content": ""},
        {"content": "   \n"},
        {"content": "x" * (config.MAX_ROUGH_NOTE_CHARS + 1)},
        {"content": "x", "title": "t" * (config.MAX_TITLE_CHARS + 1)},
        {},
    ],
)
def test_structure_rejects_invalid_input(client: TestClient, payload: dict[str, Any]) -> None:
    use_gemini(FakeGemini(StructuredNote(structured_title="t", structured_content="c")))
    assert client.post("/api/structure-rough-note", json=payload).status_code == 422


# ---------------------------------------------------------------- その他


def test_request_too_large_is_rejected(client: TestClient) -> None:
    use_gemini(None)
    response = client.post(
        "/api/structure-rough-note",
        content=b'{"content": "' + b"x" * config.MAX_REQUEST_BYTES + b'"}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413


def test_health(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"


# ---------------------------------------------------------------- parse_structured


def test_parse_structured_prefers_sdk_parsed_value() -> None:
    note = StructuredNote(structured_title="a", structured_content="b")
    assert parse_structured(note, "ignored", StructuredNote) is note


def test_parse_structured_validates_text() -> None:
    text = '{"structuredTitle": "a", "structuredContent": "b"}'
    assert parse_structured(None, text, StructuredNote) == StructuredNote(structured_title="a", structured_content="b")


def test_parse_structured_rescues_wrapped_json_as_last_resort() -> None:
    text = '```json\n{"structuredTitle": "a", "structuredContent": "b"}\n```'
    assert parse_structured(None, text, StructuredNote) == StructuredNote(structured_title="a", structured_content="b")


@pytest.mark.parametrize("text", [None, "", "not json", '{"structuredTitle": "only title"}'])
def test_parse_structured_returns_none_for_invalid(text: str | None) -> None:
    assert parse_structured(None, text, StructuredNote) is None
