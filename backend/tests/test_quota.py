"""AI エンドポイントの認証・日次クォータ・ai_generations の記録"""

from __future__ import annotations

from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app import config
from backend.app.main import app
from backend.app.models.ai import GeneratedPrd, StructuredNote
from backend.app.services.gemini import get_gemini_client

from .test_ai_router import FakeGemini

PRD_REQUEST = {"projectName": "P", "mode": "strict", "detailLevel": "brief", "notes": [{"id": "n1", "content": "abc"}]}
STRUCTURE_REQUEST = {"content": "hello"}


def use_gemini(gemini: FakeGemini | None) -> None:
    app.dependency_overrides[get_gemini_client] = lambda: gemini


@pytest.mark.parametrize(
    ("path", "body"), [("/api/generate-prd", PRD_REQUEST), ("/api/structure-rough-note", STRUCTURE_REQUEST)]
)
def test_ai_requires_session(client: TestClient, path: str, body: dict[str, Any]) -> None:
    use_gemini(None)
    response = client.post(path, json=body)
    assert response.status_code == 401


def test_guest_prd_quota(guest_client: TestClient) -> None:
    use_gemini(FakeGemini(GeneratedPrd(markdown="# ok")))
    limit = config.AI_DAILY_QUOTAS["guest"]["prd"]

    for _ in range(limit):
        assert guest_client.post("/api/generate-prd", json=PRD_REQUEST).status_code == 200

    response = guest_client.post("/api/generate-prd", json=PRD_REQUEST)
    assert response.status_code == 429
    assert response.json()["detail"] == {
        "code": "quota_exceeded",
        "kind": "prd",
        "limit": limit,
        "registeredLimit": config.AI_DAILY_QUOTAS["registered"]["prd"],
        "canUpgradeByRegistering": True,
    }

    # 種別ごとに別カウント
    use_gemini(FakeGemini(StructuredNote(structured_title="t", structured_content="c")))
    assert guest_client.post("/api/structure-rough-note", json=STRUCTURE_REQUEST).status_code == 200


def test_registered_user_has_higher_quota(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    db_admin.execute("update idea_ws.users set is_guest = false, email = 'a@example.com'")
    use_gemini(FakeGemini(GeneratedPrd(markdown="# ok")))

    for _ in range(config.AI_DAILY_QUOTAS["guest"]["prd"] + 1):
        assert guest_client.post("/api/generate-prd", json=PRD_REQUEST).status_code == 200

    db_admin.execute("update idea_ws.api_usage set count = %s", (config.AI_DAILY_QUOTAS["registered"]["prd"],))
    response = guest_client.post("/api/generate-prd", json=PRD_REQUEST)
    assert response.status_code == 429
    assert response.json()["detail"]["canUpgradeByRegistering"] is False


def test_no_quota_consumed_without_api_key(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    use_gemini(None)
    for _ in range(config.AI_DAILY_QUOTAS["guest"]["prd"] + 2):
        assert guest_client.post("/api/generate-prd", json=PRD_REQUEST).json()["usedFallback"] is True
    assert db_admin.execute("select count(*) from idea_ws.api_usage").fetchone() == (0,)


def test_ai_generations_are_recorded(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    use_gemini(FakeGemini(GeneratedPrd(markdown="# ok")))
    guest_client.post("/api/generate-prd", json=PRD_REQUEST)
    use_gemini(FakeGemini(error=TimeoutError()))
    guest_client.post("/api/structure-rough-note", json=STRUCTURE_REQUEST)
    use_gemini(None)
    guest_client.post("/api/structure-rough-note", json=STRUCTURE_REQUEST)

    rows = db_admin.execute(
        """
        select kind, mode, detail_level, note_count, input_chars, used_fallback, error_type, model,
               latency_ms >= 0, user_id is not null
        from idea_ws.ai_generations order by created_at, kind
        """
    ).fetchall()
    assert sorted(rows, key=str) == sorted(
        [
            ("prd", "strict", "brief", 1, 3, False, None, "fake-model", True, True),
            ("structure", None, None, None, 5, True, "ai_error:TimeoutError", "fake-model", True, True),
            ("structure", None, None, None, 5, True, "no_api_key", None, True, True),
        ],
        key=str,
    )
